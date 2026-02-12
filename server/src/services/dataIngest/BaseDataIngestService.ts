/**
 * BaseDataIngestService - Abstract base class for data ingest services.
 *
 * Provides common orchestration logic for fetching, refining, and managing
 * sports data across different leagues. League-specific implementations
 * extend this class and provide their own API clients, transformers, and file paths.
 */

import path from 'path';
import { createLogger, type Logger } from '../../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface IngestConfig {
  /** Interval between data fetch cycles in seconds */
  intervalSeconds: number;
  /** Jitter percentage for randomizing request timing */
  rawJitterPercent: number;
  /** Test mode: 'raw', 'refined', or empty for live */
  testMode: string;
}

export interface DataDirectories {
  /** Directory for raw JSON data */
  rawDir: string;
  /** Directory for refined JSON data */
  refinedDir: string;
  /** Directory for test data */
  testDataDir: string;
  /** Optional: Directory for rosters (NFL-specific) */
  rostersDir?: string;
}

export interface LiveEvent {
  /** Unique identifier for the event/game */
  id: string;
  /** Additional data varies by league */
  [key: string]: unknown;
}

export interface DataIngestHandlers<TRawDoc, TRefinedDoc> {
  /** Fetch list of live events/games */
  getLiveEvents: () => Promise<LiveEvent[]>;
  /** Fetch boxscore/detailed data for a single game */
  fetchBoxscore: (gameId: string) => Promise<TRawDoc | null>;
  /** Transform raw data to refined format */
  refineBoxscore: (raw: TRawDoc, gameId: string, context?: unknown) => TRefinedDoc | null;
  /** Ensure required directories exist */
  ensureDirectories: () => Promise<void>;
  /** Write JSON data atomically */
  writeJsonAtomic: (data: unknown, dir: string, filename: string) => Promise<void>;
  /** Read JSON data from file */
  readJson: (filePath: string) => Promise<unknown | null>;
  /** List files in a directory safely */
  safeListFiles: (dir: string) => Promise<string[]>;
  /** List JSON file IDs (without extension) */
  listJsonIds: (dir: string) => Promise<string[]>;
  /** Delete a file */
  deleteFile: (filePath: string) => Promise<void>;
  /** Get file modification time */
  getFileMtime: (filePath: string) => Promise<number | null>;
  /** Optional: Load roster context for refining (NFL-specific) */
  loadRosterContext?: () => Promise<unknown>;
  /** Optional: Update rosters for a game (NFL-specific) */
  updateRostersForGame?: (box: unknown, refreshedSet: Set<string>) => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Abstract Base Class
// ─────────────────────────────────────────────────────────────────────────────

export abstract class BaseDataIngestService<TRawDoc = unknown, TRefinedDoc = unknown> {
  protected readonly logger: Logger;
  protected readonly config: IngestConfig;
  protected readonly dirs: DataDirectories;
  protected readonly handlers: DataIngestHandlers<TRawDoc, TRefinedDoc>;
  protected readonly leagueName: string;

  protected dataTimer: NodeJS.Timeout | null = null;
  protected shuttingDown = false;

  protected readonly cleanupCutoffMinutes = 30;
  protected readonly postGameDeleteMinutes = 10;

  constructor(
    leagueName: string,
    config: IngestConfig,
    dirs: DataDirectories,
    handlers: DataIngestHandlers<TRawDoc, TRefinedDoc>,
  ) {
    this.leagueName = leagueName;
    this.config = config;
    this.dirs = dirs;
    this.handlers = handlers;
    this.logger = createLogger(`${leagueName.toLowerCase()}DataIngest`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Start the data ingest service.
   */
  public start(): void {
    if (this.dataTimer) {
      return;
    }

    this.handlers.ensureDirectories().catch((err) => {
      this.logger.error({ err }, `Failed to prepare ${this.leagueName} data directories`);
    });

    this.scheduleDataTick(true).catch((err) => {
      this.logger.error({ err }, `Failed to schedule initial ${this.leagueName} data tick`);
    });
  }

  /**
   * Stop the data ingest service.
   */
  public async stop(): Promise<void> {
    this.shuttingDown = true;
    if (this.dataTimer) {
      clearTimeout(this.dataTimer);
      this.dataTimer = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Core Orchestration
  // ─────────────────────────────────────────────────────────────────────────────

  protected async scheduleDataTick(firstTick = false): Promise<void> {
    if (this.shuttingDown) return;

    const delayMs = firstTick
      ? 0
      : this.jitterDelay(this.config.intervalSeconds * 1000, this.config.rawJitterPercent);

    this.dataTimer = setTimeout(async () => {
      try {
        await this.runRawFlow(firstTick);
        await this.runRefineCycle();
      } catch (err) {
        this.logger.error({ err }, `${this.leagueName} data tick failed`);
      } finally {
        this.scheduleDataTick(false).catch((error) => {
          this.logger.error({ error }, `Failed to reschedule ${this.leagueName} data tick`);
        });
      }
    }, delayMs);
  }

  protected async runRawFlow(firstTick: boolean): Promise<void> {
    if (this.config.testMode === 'raw') {
      await this.copyTestDataRaw(firstTick);
      return;
    }

    if (this.config.testMode === 'refined') {
      await this.copyTestDataRefined(firstTick);
      return;
    }

    await this.runRawTick(firstTick);
  }

  protected async runRawTick(firstTick: boolean): Promise<void> {
    this.logger.info({ firstTick }, `Starting ${this.leagueName} raw data tick`);
    if (firstTick) {
      await this.purgeInitialRaw();
    }

    const events = await this.handlers.getLiveEvents();
    if (!events.length) {
      this.logger.info(`No live ${this.leagueName} games`);
      await this.cleanupOldGames();
      return;
    }

    this.logger.info({ count: events.length }, `Found live ${this.leagueName} games`);
    const refreshedThisTick = new Set<string>();

    for (const event of events) {
      try {
        const eventId = event.id;
        if (!eventId) continue;

        const box = await this.handlers.fetchBoxscore(eventId);
        if (!box) {
          this.logger.warn({ eventId }, `Skipping ${this.leagueName} game: boxscore unavailable`);
          continue;
        }

        await this.handlers.writeJsonAtomic(box, this.dirs.rawDir, `${eventId}.json`);

        // Optional: Update rosters (NFL-specific)
        if (this.handlers.updateRostersForGame) {
          await this.handlers.updateRostersForGame(box, refreshedThisTick);
        }
      } catch (err) {
        this.logger.warn({ err, eventId: event.id }, `Failed processing ${this.leagueName} event`);
      }
    }

    await this.cleanupOldGames();
  }

  protected async runRefineCycle(): Promise<void> {
    if (this.config.testMode === 'refined') {
      this.logger.debug('Skipping refine cycle in refined test mode');
      return;
    }

    await this.handlers.ensureDirectories();
    const rawIds = await this.handlers.listJsonIds(this.dirs.rawDir);
    if (!rawIds.length) {
      this.logger.debug(`No raw ${this.leagueName} game JSON found; skipping refine`);
      return;
    }

    const removed = await this.cleanupOrphanRefinedGames(new Set(rawIds));
    if (removed) {
      this.logger.info({ removed }, `Removed orphan ${this.leagueName} refined files`);
    }

    // Optional: Load roster context
    const rosterContext = this.handlers.loadRosterContext
      ? await this.handlers.loadRosterContext()
      : undefined;

    for (const gid of rawIds) {
      try {
        const rawDoc = await this.handlers.readJson(path.join(this.dirs.rawDir, `${gid}.json`));
        if (!rawDoc) continue;

        const refined = this.handlers.refineBoxscore(rawDoc as TRawDoc, gid, rosterContext);
        if (refined) {
          await this.handlers.writeJsonAtomic(refined, this.dirs.refinedDir, `${gid}.json`);
        }
      } catch (err) {
        this.logger.warn({ gid, err }, `Failed refining ${this.leagueName} game`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Test Mode Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  protected async copyTestDataRaw(firstTick: boolean): Promise<void> {
    await this.handlers.ensureDirectories();
    if (firstTick) {
      await this.purgeInitialRaw();
    }

    const leagueLower = this.leagueName.toLowerCase();
    const testRawDir = path.join(this.dirs.testDataDir, `${leagueLower}_raw_live_stats`);
    const rawFiles = await this.handlers.safeListFiles(testRawDir);

    if (!rawFiles.length) {
      this.logger.warn({ testRawDir }, `No raw ${this.leagueName} test games found`);
    }

    for (const file of rawFiles) {
      const src = path.join(testRawDir, file);
      const data = await this.handlers.readJson(src);
      if (!data) continue;
      await this.handlers.writeJsonAtomic(data, this.dirs.rawDir, file);
    }
  }

  protected async copyTestDataRefined(firstTick: boolean): Promise<void> {
    await this.handlers.ensureDirectories();
    if (firstTick) {
      await this.purgeInitialRefined();
    }

    const leagueLower = this.leagueName.toLowerCase();
    const testRefinedDir = path.join(this.dirs.testDataDir, `${leagueLower}_refined_live_stats`);
    const refinedFiles = await this.handlers.safeListFiles(testRefinedDir);

    if (!refinedFiles.length) {
      this.logger.warn({ testRefinedDir }, `No refined ${this.leagueName} test games found`);
    }

    for (const file of refinedFiles) {
      const src = path.join(testRefinedDir, file);
      const data = await this.handlers.readJson(src);
      if (!data) continue;
      await this.handlers.writeJsonAtomic(data, this.dirs.refinedDir, file);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Cleanup Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  protected async purgeInitialRaw(): Promise<void> {
    const files = await this.handlers.safeListFiles(this.dirs.rawDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        await this.handlers.deleteFile(path.join(this.dirs.rawDir, file));
      }
    }
    this.logger.debug({ count: files.length }, `Purged initial ${this.leagueName} raw files`);
  }

  protected async purgeInitialRefined(): Promise<void> {
    const files = await this.handlers.safeListFiles(this.dirs.refinedDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        await this.handlers.deleteFile(path.join(this.dirs.refinedDir, file));
      }
    }
    this.logger.debug({ count: files.length }, `Purged initial ${this.leagueName} refined files`);
  }

  protected async cleanupOldGames(): Promise<void> {
    const rawIds = await this.handlers.listJsonIds(this.dirs.rawDir);
    const now = Date.now();
    const cutoff = this.cleanupCutoffMinutes * 60 * 1000;

    for (const gid of rawIds) {
      const filePath = path.join(this.dirs.rawDir, `${gid}.json`);
      const mtime = await this.handlers.getFileMtime(filePath);
      if (mtime && now - mtime > cutoff) {
        this.logger.debug({ gid }, `Cleaning up old ${this.leagueName} raw game`);
        await this.handlers.deleteFile(filePath);
      }
    }
  }

  protected async cleanupOrphanRefinedGames(validRawIds: Set<string>): Promise<number> {
    const refinedIds = await this.handlers.listJsonIds(this.dirs.refinedDir);
    let removed = 0;

    for (const gid of refinedIds) {
      if (!validRawIds.has(gid)) {
        const filePath = path.join(this.dirs.refinedDir, `${gid}.json`);
        await this.handlers.deleteFile(filePath);
        removed++;
      }
    }

    return removed;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Utility
  // ─────────────────────────────────────────────────────────────────────────────

  protected jitterDelay(baseMs: number, jitterPercent: number): number {
    const jitterRange = baseMs * (jitterPercent / 100);
    const jitter = Math.random() * jitterRange * 2 - jitterRange;
    return Math.max(0, Math.round(baseMs + jitter));
  }
}
