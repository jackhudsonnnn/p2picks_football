/**
 * NFL Data Ingest Service - Main Orchestration
 * 
 * Coordinates fetching raw NFL data from ESPN, refining it into a normalized
 * format, and managing roster updates. The heavy lifting is delegated to
 * specialized modules.
 */

import path from 'path';
import { createLogger } from '../../utils/logger';
import { getLiveEvents, fetchBoxscore } from '../../utils/nfl/espnClient';
import { refineBoxscore } from '../../utils/nfl/nflRefinementTransformer';
import { loadRosterPlayers, updateRostersForGame } from './nflRosterService';
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
  ROSTERS_DIR,
} from '../../utils/fileStorage';
import {
  NFL_DATA_INTERVAL_SECONDS,
  NFL_DATA_RAW_JITTER_PERCENT,
  NFL_DATA_TEST_MODE,
} from '../../constants/environment';

const logger = createLogger('nflDataIngest');

interface IngestConfig {
  intervalSeconds: number;
  rawJitterPercent: number;
  testMode: string;
}

const DEFAULT_CONFIG: IngestConfig = {
  intervalSeconds: NFL_DATA_INTERVAL_SECONDS,
  rawJitterPercent: NFL_DATA_RAW_JITTER_PERCENT,
  testMode: NFL_DATA_TEST_MODE,
};

const CLEANUP_CUTOFF_MINUTES = 30;
const POST_GAME_DELETE_MINUTES = 10;

let dataTimer: NodeJS.Timeout | null = null;
let shuttingDown = false;

/**
 * Start the NFL data ingest service.
 */
export function startNflDataIngestService(): void {
  if (dataTimer) {
    return;
  }

  ensureDirectories().catch((err) => {
    logger.error({ err }, 'Failed to prepare data directories');
  });

  scheduleDataTick(true).catch((err) => {
    logger.error({ err }, 'Failed to schedule initial data tick');
  });
}

/**
 * Stop the NFL data ingest service.
 */
export async function stopNflDataIngestService(): Promise<void> {
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
      logger.error({ err }, 'Data tick failed');
    } finally {
      scheduleDataTick(false).catch((error) => {
        logger.error({ error }, 'Failed to reschedule data tick');
      });
    }
  }, delayMs);
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
      await writeJsonAtomic(box, RAW_DIR, `${eventId}.json`);
      await updateRostersForGame(box as Record<string, unknown>, refreshedThisTick);
    } catch (err) {
      logger.warn({ err }, 'Failed processing event');
    }
  }

  await cleanupOldGames();
}

async function runRefineCycle(): Promise<void> {
  if (DEFAULT_CONFIG.testMode === 'refined') {
    logger.debug('Skipping refine cycle in refined test mode');
    return;
  }

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
  await ensureDirectories();
  if (firstTick) {
    await purgeInitialRaw();
  }

  const testRawDir = path.join(TEST_DATA_DIR, 'raw', 'nfl_raw_live_stats');
  const rawFiles = await safeListFiles(testRawDir);

  if (!rawFiles.length) {
    logger.warn({ testRawDir }, 'No raw test games found');
  }

  for (const file of rawFiles) {
    const src = path.join(testRawDir, file);
    const data = await readJson(src);
    if (!data) continue;
    await writeJsonAtomic(data, RAW_DIR, file);
  }

  await copyTestRosters(firstTick);
}

async function copyTestRosters(firstTick: boolean): Promise<void> {
  if (!firstTick) return;

  const testRostersDir = path.join(TEST_DATA_DIR, 'raw', 'nfl_rosters');
  const rosterFiles = await safeListFiles(testRostersDir);

  if (!rosterFiles.length) {
    logger.debug({ testRostersDir }, 'No test rosters found to copy');
    return;
  }

  for (const file of rosterFiles) {
    const src = path.join(testRostersDir, file);
    const data = await readJson(src);
    if (!data) continue;
    await writeJsonAtomic(data, ROSTERS_DIR, file);
  }
}

async function copyTestDataRefined(firstTick: boolean): Promise<void> {
  await ensureDirectories();
  if (firstTick) {
    await purgeInitialRaw();
    await purgeRefined();
  }

  const testRefinedDir = path.join(TEST_DATA_DIR, 'refined', 'nfl_refined_live_stats');
  const refinedFiles = await safeListFiles(testRefinedDir);

  if (!refinedFiles.length) {
    logger.warn({ testRefinedDir }, 'No refined test games found');
  }

  for (const file of refinedFiles) {
    const src = path.join(testRefinedDir, file);
    const data = await readJson(src);
    if (!data) continue;
    await writeJsonAtomic(data, REFINED_DIR, file);
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
  const removed = await purgeDir(RAW_DIR);
  if (removed) {
    logger.info({ removed }, 'Purged existing raw files on start');
  }
}

async function purgeRefined(): Promise<void> {
  const removed = await purgeDir(REFINED_DIR);
  if (removed) {
    logger.info({ removed }, 'Purged existing refined files on start');
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
