/**
 * NFL roster management service.
 * Handles fetching, caching, and loading team rosters.
 */

import path from 'path';
import { createLogger } from '../../utils/logger';
import { fetchRoster } from '../../utils/nfl/espnClient';
import {
  ROSTERS_DIR,
  writeJsonAtomic,
  readJson,
  safeListFiles,
  getFileMtime,
} from '../../utils/fileStorage';
import { NFL_ROSTER_REFRESH_SECONDS } from '../../constants/environment';

const logger = createLogger('rosterService');

export interface PlayerEntry {
  athleteId: string;
  fullName: string;
  position: string;
  jersey: string;
  headshot: string;
  stats: Record<string, Record<string, unknown>>;
}

/** In-memory cache of last roster refresh timestamps by team ID */
const lastRosterRefresh = new Map<string, number>();

/**
 * Check if a roster file is stale and needs refreshing.
 */
export async function isRosterStale(teamId: string): Promise<boolean> {
  const refreshInterval = NFL_ROSTER_REFRESH_SECONDS;
  const last = lastRosterRefresh.get(teamId);
  if (last && Date.now() - last < refreshInterval) {
    return false;
  }
  const filePath = path.join(ROSTERS_DIR, `${teamId}.json`);
  const mtime = await getFileMtime(filePath);
  if (mtime !== null) {
    const age = Date.now() - mtime;
    if (age < refreshInterval) {
      lastRosterRefresh.set(teamId, mtime);
      return false;
    }
  }
  return true;
}

/**
 * Update rosters for teams in a boxscore if they're stale.
 */
export async function updateRostersForGame(
  boxscore: Record<string, unknown>,
  refreshed: Set<string>
): Promise<void> {
  try {
    const header = boxscore?.header as Record<string, unknown> | undefined;
    const competitions = (header?.competitions as unknown[]) ?? [];
    const competitors =
      ((competitions[0] as Record<string, unknown>)?.competitors as unknown[]) ?? [];

    for (const comp of competitors) {
      const compObj = comp as Record<string, unknown>;
      const team = compObj?.team as Record<string, unknown> | undefined;
      const teamId = String(team?.id ?? '');
      if (!teamId || refreshed.has(teamId)) continue;

      if (!(await isRosterStale(teamId))) {
        logger.debug({ teamId }, 'Roster fresh, skipping fetch');
        continue;
      }

      const data = await fetchRoster(teamId);
      if (!data) continue;

      await writeJsonAtomic(data, ROSTERS_DIR, `${teamId}.json`);
      refreshed.add(teamId);
      lastRosterRefresh.set(teamId, Date.now());
      logger.info({ teamId }, 'Roster updated');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed updating rosters');
  }
}

/**
 * Load all roster players from disk into a map by team ID.
 */
export async function loadRosterPlayers(): Promise<Map<string, Map<string, PlayerEntry>>> {
  const result = new Map<string, Map<string, PlayerEntry>>();
  const files = await safeListFiles(ROSTERS_DIR);

  for (const file of files) {
    try {
      const data = (await readJson(path.join(ROSTERS_DIR, file))) as Record<
        string,
        unknown
      > | null;
      if (!data) continue;

      const teamId = path.parse(file).name;
      const playersMap = new Map<string, PlayerEntry>();
      const groups = Array.isArray(data.athletes) ? data.athletes : [];

      for (const group of groups) {
        const groupObj = group as Record<string, unknown>;
        const items = Array.isArray(groupObj.items) ? groupObj.items : [];
        for (const item of items) {
          const itemObj = item as Record<string, unknown>;
          const athleteId = String(itemObj.id ?? '');
          const statusType = getStatusType(itemObj.status);
          if (statusType && !isActiveStatus(statusType)) continue;

          const position = (itemObj.position as Record<string, unknown>) ?? {};
          const headshotField = itemObj.headshot;
          const headshot =
            typeof headshotField === 'string'
              ? headshotField
              : (headshotField as Record<string, unknown>)?.href ?? '';

          if (!athleteId) continue;

          const player: PlayerEntry = {
            athleteId,
            fullName: String(itemObj.displayName ?? itemObj.fullName ?? ''),
            position: String(position.abbreviation ?? position.name ?? ''),
            jersey: String(itemObj.jersey ?? ''),
            headshot: String(headshot),
            stats: {},
          };
          playersMap.set(athleteId, player);
        }
      }
      result.set(teamId, playersMap);
    } catch (err) {
      logger.debug({ err, file }, 'Failed loading roster');
    }
  }
  return result;
}

function getStatusType(source: unknown): string | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const raw = (source as Record<string, unknown>).type;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function isActiveStatus(statusType?: string): boolean {
  if (!statusType) return true;
  return statusType.trim().toLowerCase() === 'active';
}
