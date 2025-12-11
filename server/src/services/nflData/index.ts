/**
 * NFL Data Ingest Service - Main Orchestration
 * 
 * Coordinates fetching raw NFL data from ESPN, refining it into a normalized
 * format, and managing roster updates. The heavy lifting is delegated to
 * specialized modules.
 */

import path from 'path';
import { createLogger } from './logger';
import { getLiveEvents, fetchBoxscore } from './espnClient';
import { refineBoxscore } from './refinementService';
import { loadRosterPlayers, updateRostersForGame } from './rosterService';
import {
  ensureDirectories,
  writeJsonAtomic,
  readJson,
  safeListFiles,
  listJsonIds,
  deleteFile,
  getFileMtime,
  RAW_DIR,
  REFINED_DIR,
  TEST_DATA_DIR,
} from './fileStorage';

const logger = createLogger('nflDataIngest');

interface IngestConfig {
  rawIntervalSeconds: number;
  rawJitterPercent: number;
  refinedIntervalSeconds: number;
  testingMode: boolean;
}

const DEFAULT_CONFIG: IngestConfig = {
  rawIntervalSeconds: clampInterval(Number(process.env.NFL_DATA_RAW_INTERVAL_SECONDS) || 20),
  rawJitterPercent: Math.max(0, Number(process.env.NFL_DATA_RAW_JITTER_PERCENT) || 10),
  refinedIntervalSeconds: clampInterval(Number(process.env.NFL_DATA_REFINED_INTERVAL_SECONDS) || 20),
  testingMode: String(process.env.NFL_DATA_TEST_MODE || '').toLowerCase() === 'true',
};

const CLEANUP_CUTOFF_MINUTES = 30;
const POST_GAME_DELETE_MINUTES = 10;

let rawTimer: NodeJS.Timeout | null = null;
let refinedTimer: NodeJS.Timeout | null = null;
let shuttingDown = false;

/**
 * Start the NFL data ingest service.
 */
export function startNflDataIngestService(): void {
  if (rawTimer || refinedTimer) {
    return;
  }

  ensureDirectories().catch((err) => {
    logger.error({ err }, 'Failed to prepare data directories');
  });

  scheduleRawTick(true).catch((err) => {
    logger.error({ err }, 'Failed to schedule initial raw tick');
  });

  scheduleRefinedTick().catch((err) => {
    logger.error({ err }, 'Failed to schedule refined tick');
  });
}

/**
 * Stop the NFL data ingest service.
 */
export async function stopNflDataIngestService(): Promise<void> {
  shuttingDown = true;
  if (rawTimer) {
    clearTimeout(rawTimer);
    rawTimer = null;
  }
  if (refinedTimer) {
    clearTimeout(refinedTimer);
    refinedTimer = null;
  }
}

async function scheduleRawTick(firstTick = false): Promise<void> {
  if (shuttingDown) return;

  const delayMs = firstTick
    ? 0
    : jitterDelay(DEFAULT_CONFIG.rawIntervalSeconds * 1000, DEFAULT_CONFIG.rawJitterPercent);

  rawTimer = setTimeout(async () => {
    try {
      if (DEFAULT_CONFIG.testingMode) {
        await copyTestData();
      } else {
        await runRawTick(firstTick);
      }
    } catch (err) {
      logger.error({ err }, 'Raw tick failed');
    } finally {
      scheduleRawTick(false).catch((error) => {
        logger.error({ error }, 'Failed to reschedule raw tick');
      });
    }
  }, delayMs);
}

async function scheduleRefinedTick(): Promise<void> {
  if (shuttingDown) return;
  refinedTimer = setTimeout(async () => {
    try {
      await runRefineCycle();
    } catch (err) {
      logger.error({ err }, 'Refine cycle failed');
    } finally {
      scheduleRefinedTick().catch((error) => {
        logger.error({ error }, 'Failed to reschedule refined tick');
      });
    }
  }, DEFAULT_CONFIG.refinedIntervalSeconds * 1000);
}

async function runRawTick(firstTick: boolean): Promise<void> {
  logger.info({ firstTick }, 'Starting raw data tick');
  if (firstTick) {
    await purgeInitialRaw();
  }

  const events = await getLiveEvents();
  if (!events.length) {
    logger.info('No live NFL games');
    await cleanupOldGames();
    return;
  }

  logger.info({ count: events.length }, 'Found live games');
  const refreshedThisTick = new Set<string>();

  for (const event of events) {
    try {
      const eventId = String(event.id || event.uid || '');
      if (!eventId) continue;
      const box = await fetchBoxscore(eventId);
      if (!box) {
        logger.warn({ eventId }, 'Skipping game: boxscore unavailable');
        continue;
      }
      await writeJsonAtomic(box, RAW_DIR, `${eventId}.json`, true);
      await updateRostersForGame(box as Record<string, unknown>, refreshedThisTick);
    } catch (err) {
      logger.warn({ err }, 'Failed processing event');
    }
  }

  await cleanupOldGames();
}

async function runRefineCycle(): Promise<void> {
  await ensureDirectories();
  const rawIds = await listJsonIds(RAW_DIR);
  if (!rawIds.length) {
    logger.debug('No raw game JSON found; skipping refine');
    return;
  }

  const removed = await cleanupOrphanRefinedGames(new Set(rawIds));
  if (removed) {
    logger.info({ removed }, 'Removed orphan refined files');
  }

  const rosterMap = await loadRosterPlayers();
  for (const gid of rawIds) {
    try {
      const rawDoc = await readJson(path.join(RAW_DIR, `${gid}.json`));
      if (!rawDoc) continue;
      const refined = refineBoxscore(rawDoc, gid, rosterMap);
      if (refined) {
        await writeJsonAtomic(refined, REFINED_DIR, `${gid}.json`);
      }
    } catch (err) {
      logger.warn({ gid, err }, 'Failed refining game');
    }
  }
}

async function copyTestData(): Promise<void> {
  await ensureDirectories();
  await purgeInitialRaw();
  const testRaw = path.join(TEST_DATA_DIR, 'nfl_raw_live_stats');

  const rawFiles = await safeListFiles(testRaw);
  for (const file of rawFiles) {
    const src = path.join(testRaw, file);
    const data = await readJson(src);
    if (!data) continue;
    await writeJsonAtomic(data, RAW_DIR, file, true);
  }
}

async function cleanupOldGames(): Promise<void> {
  const files = await safeListFiles(RAW_DIR);
  const now = Date.now();
  const defaultCutoff = CLEANUP_CUTOFF_MINUTES * 60 * 1000;
  const postCutoff = POST_GAME_DELETE_MINUTES * 60 * 1000;
  let removed = 0;

  for (const file of files) {
    const fullPath = path.join(RAW_DIR, file);
    try {
      const mtime = await getFileMtime(fullPath);
      if (mtime === null) continue;

      const data = (await readJson(fullPath)) as Record<string, unknown> | null;
      const state = getGameState(data);

      if (state === 'post') {
        if (now - mtime >= postCutoff) {
          if (await deleteFile(fullPath)) removed++;
        }
        continue;
      }

      if (!isFinal(data)) continue;
      if (now - mtime >= defaultCutoff) {
        if (await deleteFile(fullPath)) removed++;
      }
    } catch (err) {
      logger.debug({ err, file }, 'Cleanup failed');
    }
  }

  if (removed) {
    logger.info({ removed }, 'Removed stale raw game files');
  }
}

function getGameState(data: unknown): string {
  try {
    const obj = data as Record<string, unknown>;
    const header = obj?.header as Record<string, unknown>;
    const competitions = header?.competitions as unknown[];
    const comp0 = competitions?.[0] as Record<string, unknown>;
    const status = comp0?.status as Record<string, unknown>;
    const type = status?.type as Record<string, unknown>;
    return String(type?.state ?? '');
  } catch {
    return '';
  }
}

function isFinal(data: unknown): boolean {
  try {
    const obj = data as Record<string, unknown>;
    const header = obj?.header as Record<string, unknown>;
    const competitions = header?.competitions as unknown[];
    const comp0 = competitions?.[0] as Record<string, unknown>;
    const status = comp0?.status as Record<string, unknown>;
    const type = status?.type as Record<string, unknown>;
    const state = type?.state;
    if (state === 'post' || Boolean(type?.completed)) return true;
    if (String(type?.name ?? '').toUpperCase() === 'STATUS_FINAL') return true;
  } catch (err) {
    logger.debug({ err }, 'Failed to detect final state');
  }
  return false;
}

async function purgeInitialRaw(): Promise<void> {
  const files = await safeListFiles(RAW_DIR);
  let removed = 0;
  for (const file of files) {
    if (await deleteFile(path.join(RAW_DIR, file))) {
      removed++;
    }
  }
  if (removed) {
    logger.info({ removed }, 'Purged existing raw files on start');
  }
}

async function cleanupOrphanRefinedGames(sourceIds: Set<string>): Promise<number> {
  const files = await safeListFiles(REFINED_DIR);
  let removed = 0;
  for (const file of files) {
    const gid = path.parse(file).name;
    if (!sourceIds.has(gid)) {
      if (await deleteFile(path.join(REFINED_DIR, file))) {
        removed++;
      }
    }
  }
  return removed;
}

function jitterDelay(baseMs: number, jitterPercent: number): number {
  if (!jitterPercent || jitterPercent <= 0) return baseMs;
  const span = baseMs * (jitterPercent / 100);
  const low = Math.max(1000, baseMs - span);
  const high = baseMs + span;
  return Math.floor(low + Math.random() * (high - low));
}

function clampInterval(value: number): number {
  if (!Number.isFinite(value)) return 60;
  return Math.max(10, Math.min(300, value));
}
