/**
 * NBA Data Ingest Service - Main Orchestration
 * 
 * Coordinates fetching raw NBA data from NBA.com, refining it into a normalized
 * format, and managing file storage. Inspired by the NFL data ingest service.
 */

import path from 'path';
import { createLogger } from '../../utils/logger';
import { getLiveGames, fetchBoxscore } from '../../utils/nba/nbaClient';
import { refineBoxscore } from '../../utils/nba/nbaRefinementTransformer';
import {
  ensureNbaDirectories,
  writeJsonAtomic,
  readJson,
  safeListFiles,
  listJsonIds,
  deleteFile,
  getFileMtime,
  NBA_RAW_DIR,
  NBA_REFINED_DIR,
  NBA_TEST_DATA_DIR,
} from '../../utils/nba/nbaFileStorage';
import { env } from '../../config/env';

const logger = createLogger('nbaDataIngest');

interface IngestConfig {
  intervalSeconds: number;
  rawJitterPercent: number;
  testMode: string;
}

const DEFAULT_CONFIG: IngestConfig = {
  intervalSeconds: env.NBA_DATA_INTERVAL_SECONDS,
  rawJitterPercent: env.NBA_DATA_RAW_JITTER_PERCENT,
  testMode: env.NBA_DATA_TEST_MODE,
};

const CLEANUP_CUTOFF_MINUTES = 30;
const POST_GAME_DELETE_MINUTES = 10;

let dataTimer: NodeJS.Timeout | null = null;
let shuttingDown = false;

/**
 * Start the NBA data ingest service.
 */
export function startNbaDataIngestService(): void {
  if (dataTimer) {
    return;
  }

  ensureNbaDirectories().catch((err) => {
    logger.error({ err }, 'Failed to prepare NBA data directories');
  });

  scheduleDataTick(true).catch((err) => {
    logger.error({ err }, 'Failed to schedule initial NBA data tick');
  });
}

/**
 * Stop the NBA data ingest service.
 */
export async function stopNbaDataIngestService(): Promise<void> {
  shuttingDown = true;
  if (dataTimer) {
    clearTimeout(dataTimer);
    dataTimer = null;
  }
}

async function scheduleDataTick(firstTick = false): Promise<void> {
  if (shuttingDown) return;

  const delayMs = firstTick
    ? 0
    : jitterDelay(DEFAULT_CONFIG.intervalSeconds * 1000, DEFAULT_CONFIG.rawJitterPercent);

  dataTimer = setTimeout(async () => {
    try {
      await runRawFlow(firstTick);
      await runRefineCycle();
    } catch (err) {
      logger.error({ err }, 'NBA data tick failed');
    } finally {
      scheduleDataTick(false).catch((error) => {
        logger.error({ error }, 'Failed to reschedule NBA data tick');
      });
    }
  }, delayMs);
}

async function runRawTick(firstTick: boolean): Promise<void> {
  logger.info({ firstTick }, 'Starting NBA raw data tick');
  if (firstTick) {
    await purgeInitialRaw();
  }

  const games = await getLiveGames();
  if (!games.length) {
    logger.info('No live NBA games');
    await cleanupOldGames();
    return;
  }

  logger.info({ count: games.length }, 'Found live NBA games');

  for (const game of games) {
    try {
      const gameId = game.gameId;
      if (!gameId) continue;
      
      const box = await fetchBoxscore(gameId);
      if (!box) {
        continue;
      }
      await writeJsonAtomic(box, NBA_RAW_DIR, `${gameId}.json`);
    } catch (err) {
      logger.warn({ err, gameId: game.gameId }, 'Failed processing NBA game');
    }
  }

  await cleanupOldGames();
}

async function runRefineCycle(): Promise<void> {
  if (DEFAULT_CONFIG.testMode === 'refined') {
    logger.debug('Skipping refine cycle in refined test mode');
    return;
  }

  await ensureNbaDirectories();
  const rawIds = await listJsonIds(NBA_RAW_DIR);
  if (!rawIds.length) {
    logger.debug('No raw NBA game JSON found; skipping refine');
    return;
  }

  const removed = await cleanupOrphanRefinedGames(new Set(rawIds));
  if (removed) {
    logger.info({ removed }, 'Removed orphan NBA refined files');
  }

  for (const gid of rawIds) {
    try {
      const rawDoc = await readJson(path.join(NBA_RAW_DIR, `${gid}.json`));
      if (!rawDoc) continue;
      const refined = refineBoxscore(rawDoc, gid);
      if (refined) {
        await writeJsonAtomic(refined, NBA_REFINED_DIR, `${gid}.json`);
      }
    } catch (err) {
      logger.warn({ gid, err }, 'Failed refining NBA game');
    }
  }
}

async function runRawFlow(firstTick: boolean): Promise<void> {
  if (DEFAULT_CONFIG.testMode === 'raw') {
    await copyTestDataRaw(firstTick);
    return;
  }

  if (DEFAULT_CONFIG.testMode === 'refined') {
    await copyTestDataRefined(firstTick);
    return;
  }

  await runRawTick(firstTick);
}

async function copyTestDataRaw(firstTick: boolean): Promise<void> {
  await ensureNbaDirectories();
  if (firstTick) {
    await purgeInitialRaw();
  }

  // New test data layout: test_nba_data/nba_raw_live_stats
  const testRawDir = path.join(NBA_TEST_DATA_DIR, 'nba_raw_live_stats');
  const rawFiles = await safeListFiles(testRawDir);

  if (!rawFiles.length) {
    logger.warn({ testRawDir }, 'No raw NBA test games found');
  }

  for (const file of rawFiles) {
    const src = path.join(testRawDir, file);
    const data = await readJson(src);
    if (!data) continue;
    await writeJsonAtomic(data, NBA_RAW_DIR, file);
  }
}

async function copyTestDataRefined(firstTick: boolean): Promise<void> {
  await ensureNbaDirectories();
  if (firstTick) {
    await purgeInitialRaw();
    await purgeRefined();
  }

  // New test data layout: test_nba_data/nba_refined_live_stats
  const testRefinedDir = path.join(NBA_TEST_DATA_DIR, 'nba_refined_live_stats');
  const refinedFiles = await safeListFiles(testRefinedDir);

  if (!refinedFiles.length) {
    logger.warn({ testRefinedDir }, 'No refined NBA test games found');
  }

  for (const file of refinedFiles) {
    const src = path.join(testRefinedDir, file);
    const data = await readJson(src);
    if (!data) continue;
    await writeJsonAtomic(data, NBA_REFINED_DIR, file);
  }
}

async function cleanupOldGames(): Promise<void> {
  const files = await safeListFiles(NBA_RAW_DIR);
  const now = Date.now();
  const defaultCutoff = CLEANUP_CUTOFF_MINUTES * 60 * 1000;
  const postCutoff = POST_GAME_DELETE_MINUTES * 60 * 1000;
  let removed = 0;

  for (const file of files) {
    const fullPath = path.join(NBA_RAW_DIR, file);
    try {
      const mtime = await getFileMtime(fullPath);
      if (mtime === null) continue;

      const data = (await readJson(fullPath)) as Record<string, unknown> | null;
      const gameStatus = getGameStatus(data);

      // Game is final (status 3)
      if (gameStatus === 3) {
        if (now - mtime >= postCutoff) {
          if (await deleteFile(fullPath)) removed++;
        }
        continue;
      }

      // Otherwise use default cutoff for stale data
      if (now - mtime >= defaultCutoff) {
        if (await deleteFile(fullPath)) removed++;
      }
    } catch (err) {
      logger.debug({ err, file }, 'Cleanup failed');
    }
  }

  if (removed) {
    logger.info({ removed }, 'Removed stale raw NBA game files');
  }
}

function getGameStatus(data: unknown): number {
  try {
    const obj = data as Record<string, unknown>;
    const game = obj?.game as Record<string, unknown>;
    return Number(game?.gameStatus ?? 0);
  } catch {
    return 0;
  }
}

async function purgeInitialRaw(): Promise<void> {
  const removed = await purgeDir(NBA_RAW_DIR);
  if (removed) {
    logger.info({ removed }, 'Purged existing NBA raw files on start');
  }
}

async function purgeRefined(): Promise<void> {
  const removed = await purgeDir(NBA_REFINED_DIR);
  if (removed) {
    logger.info({ removed }, 'Purged existing NBA refined files on start');
  }
}

async function purgeDir(dir: string): Promise<number> {
  const files = await safeListFiles(dir);
  let removed = 0;
  for (const file of files) {
    if (await deleteFile(path.join(dir, file))) {
      removed++;
    }
  }
  return removed;
}

async function cleanupOrphanRefinedGames(sourceIds: Set<string>): Promise<number> {
  const files = await safeListFiles(NBA_REFINED_DIR);
  let removed = 0;
  for (const file of files) {
    const gid = path.parse(file).name;
    if (!sourceIds.has(gid)) {
      if (await deleteFile(path.join(NBA_REFINED_DIR, file))) {
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
