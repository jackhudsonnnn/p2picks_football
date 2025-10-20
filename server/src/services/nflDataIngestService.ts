import { promises as fs } from 'fs';
import path from 'path';

type LogPayload = Record<string, unknown>;

const logger = buildLogger();

interface IngestConfig {
  rawIntervalSeconds: number;
  rawJitterPercent: number;
  refinedIntervalSeconds: number;
  rosterRefreshIntervalSeconds: number;
  testingMode: boolean;
}

type PlayerStats = Record<string, any>;

type TeamEntry = {
  teamId: string;
  abbreviation: string;
  displayName: string;
  name: string;
  score: number;
  stats: Record<string, PlayerStats>;
  players: Record<string, PlayerEntry>;
  possession: boolean;
};

type PlayerEntry = {
  athleteId: string;
  fullName: string;
  position: string;
  jersey: string;
  headshot: string;
  stats: Record<string, PlayerStats>;
};

const BASE_URL = 'http://site.api.espn.com/apis/site/v2/sports/football/nfl';
const SCOREBOARD_URL = `${BASE_URL}/scoreboard`;
const SUMMARY_URL_TMPL = `${BASE_URL}/summary?event={event_id}`;
const ROSTER_URL_TMPL = `${BASE_URL}/teams/{team_id}/roster`;

const RAW_DIR = path.resolve(__dirname, '..', 'data', 'nfl_raw_live_stats');
const REFINED_DIR = path.resolve(__dirname, '..', 'data', 'nfl_refined_live_stats');
const ROSTERS_DIR = path.resolve(__dirname, '..', 'data', 'nfl_rosters');
const TEST_DATA_DIR = path.resolve(__dirname, '..', 'data', 'test_nfl_data');

const CLEANUP_CUTOFF_MINUTES = 30;
const POST_GAME_DELETE_MINUTES = 10;

const DEFAULT_CONFIG: IngestConfig = {
  rawIntervalSeconds: clampInterval(Number(process.env.NFL_DATA_RAW_INTERVAL_SECONDS) || 60),
  rawJitterPercent: Math.max(0, Number(process.env.NFL_DATA_RAW_JITTER_PERCENT) || 10),
  refinedIntervalSeconds: clampInterval(Number(process.env.NFL_DATA_REFINED_INTERVAL_SECONDS) || 60),
  rosterRefreshIntervalSeconds: Number(process.env.NFL_DATA_ROSTER_REFRESH_SECONDS) || 24 * 60 * 60,
  testingMode: String(process.env.NFL_DATA_TEST_MODE || '').toLowerCase() === 'true',
};

const DEFAULT_CATEGORIES: Record<string, Record<string, any>> = {
  passing: {
    'completions/passingAttempts': '0/0',
    passingYards: 0,
    yardsPerPassAttempt: 0,
    passingTouchdowns: 0,
    interceptions: 0,
    'sacks-sackYardsLost': '0-0',
    adjQBR: 0,
    QBRating: 0,
  },
  rushing: {
    rushingAttempts: 0,
    rushingYards: 0,
    yardsPerRushAttempt: 0,
    rushingTouchdowns: 0,
    longRushing: 0,
  },
  receiving: {
    receptions: 0,
    receivingYards: 0,
    yardsPerReception: 0,
    receivingTouchdowns: 0,
    longReception: 0,
    receivingTargets: 0,
  },
  fumbles: {
    fumbles: 0,
    fumblesLost: 0,
    fumblesRecovered: 0,
  },
  defensive: {
    totalTackles: 0,
    soloTackles: 0,
    sacks: 0,
    tacklesForLoss: 0,
    passesDefended: 0,
    QBHits: 0,
    defensiveTouchdowns: 0,
  },
  interceptions: {
    interceptions: 0,
    interceptionYards: 0,
    interceptionTouchdowns: 0,
  },
  kickReturns: {
    kickReturns: 0,
    kickReturnYards: 0,
    yardsPerKickReturn: 0,
    longKickReturn: 0,
    kickReturnTouchdowns: 0,
  },
  puntReturns: {
    puntReturns: 0,
    puntReturnYards: 0,
    yardsPerPuntReturn: 0,
    longPuntReturn: 0,
    puntReturnTouchdowns: 0,
  },
  kicking: {
    'fieldGoalsMade/fieldGoalAttempts': '0/0',
    fieldGoalPct: 0,
    longFieldGoalMade: 0,
    'extraPointsMade/extraPointAttempts': '0/0',
    totalKickingPoints: 0,
  },
  punting: {
    punts: 0,
    puntYards: 0,
    grossAvgPuntYards: 0,
    touchbacks: 0,
    puntsInside20: 0,
    longPunt: 0,
  },
};

const TEAM_SCORING_DEFAULT = {
  touchdowns: 0,
  fieldGoals: 0,
  safeties: 0,
};

function buildLogger() {
  const prefix = '[nflDataIngest]';
  return {
    info(payload: LogPayload | string, message?: string) {
      if (typeof payload === 'string') {
        console.info(prefix, payload);
      } else {
        console.info(prefix, message ?? '', payload);
      }
    },
    debug(payload: LogPayload | string, message?: string) {
      if (process.env.NODE_ENV === 'production') return;
      if (typeof payload === 'string') {
        console.debug(prefix, payload);
      } else {
        console.debug(prefix, message ?? '', payload);
      }
    },
    warn(payload: LogPayload | string, message?: string) {
      if (typeof payload === 'string') {
        console.warn(prefix, payload);
      } else {
        console.warn(prefix, message ?? '', payload);
      }
    },
    error(payload: LogPayload | string, message?: string) {
      if (typeof payload === 'string') {
        console.error(prefix, payload);
      } else {
        console.error(prefix, message ?? '', payload);
      }
    },
  };
}

let rawTimer: NodeJS.Timeout | null = null;
let refinedTimer: NodeJS.Timeout | null = null;
let shuttingDown = false;
const lastRosterRefresh = new Map<string, number>();

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
      await updateRostersForGame(box, refreshedThisTick);
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
      if (!rawDoc) {
        continue;
      }
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
  const testRosters = path.join(TEST_DATA_DIR, 'nfl_rosters');

  const rawFiles = await safeList(testRaw);
  for (const file of rawFiles) {
    const src = path.join(testRaw, file);
    const data = await readJson(src);
    if (!data) continue;
    await writeJsonAtomic(data, RAW_DIR, file, true);
  }

  if (!DEFAULT_CONFIG.testingMode) return;

  const rosterFiles = await safeList(testRosters);
  for (const file of rosterFiles) {
    const src = path.join(testRosters, file);
    const data = await readJson(src);
    if (!data) continue;
    await writeJsonAtomic(data, ROSTERS_DIR, file, false);
    lastRosterRefresh.set(path.parse(file).name, Date.now());
  }
}

async function updateRostersForGame(boxscore: any, refreshed: Set<string>): Promise<void> {
  try {
    const competitors =
      boxscore?.header?.competitions?.[0]?.competitors ?? [];
    for (const comp of competitors) {
      const team = comp?.team ?? {};
      const teamId = String(team.id ?? '');
      if (!teamId || refreshed.has(teamId)) continue;
  if (!(await isRosterStale(teamId))) {
        logger.debug({ teamId }, 'Roster fresh, skipping fetch');
        continue;
      }
      const data = await fetchRoster(teamId);
      if (!data) continue;
      await writeJsonAtomic(data, ROSTERS_DIR, `${teamId}.json`, false);
      refreshed.add(teamId);
      lastRosterRefresh.set(teamId, Date.now());
      logger.info({ teamId }, 'Roster updated');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed updating rosters');
  }
}

async function isRosterStale(teamId: string): Promise<boolean> {
  const last = lastRosterRefresh.get(teamId);
  if (last && Date.now() - last < DEFAULT_CONFIG.rosterRefreshIntervalSeconds * 1000) {
    return false;
  }
  const filePath = path.join(ROSTERS_DIR, `${teamId}.json`);
  try {
    const stat = await fs.stat(filePath);
    const age = Date.now() - stat.mtimeMs;
    if (age < DEFAULT_CONFIG.rosterRefreshIntervalSeconds * 1000) {
      lastRosterRefresh.set(teamId, stat.mtimeMs);
      return false;
    }
  } catch (_err) {
    return true;
  }
  return true;
}

async function fetchRoster(teamId: string): Promise<any | null> {
    const url = ROSTER_URL_TMPL.replace('{team_id}', teamId);
    return fetchJson(url);
}

async function fetchBoxscore(eventId: string): Promise<any | null> {
    const summaryUrl = SUMMARY_URL_TMPL.replace('{event_id}', eventId);
    let data = await fetchJson(summaryUrl);
    return data;
}

async function getLiveEvents(): Promise<any[]> {
    const data = await fetchJson(SCOREBOARD_URL);
    if (!data) return [];
    const events = Array.isArray(data.events) ? data.events : [];
    return events.filter((event: any) => {
    const state = event?.status?.type?.state;
    return state === 'in' || state === 'pre';
    });
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'p2picks-nfl-data/1.0',
      },
    });
    if (!res.ok) {
      logger.debug({ url, status: res.status }, 'Fetch failed');
      return null;
    }
    return res.json();
  } catch (err) {
    logger.debug({ url, err }, 'HTTP error');
    return null;
  }
}

async function cleanupOldGames(): Promise<void> {
  const files = await safeList(RAW_DIR);
  const now = Date.now();
  const defaultCutoff = CLEANUP_CUTOFF_MINUTES * 60 * 1000;
  const postCutoff = POST_GAME_DELETE_MINUTES * 60 * 1000;
  let removed = 0;
  for (const file of files) {
    const fullPath = path.join(RAW_DIR, file);
    try {
      const stat = await fs.stat(fullPath);
      const data = await readJson(fullPath);
      const state = data?.header?.competitions?.[0]?.status?.type?.state || '';
      if (state === 'post') {
        if (now - stat.mtimeMs >= postCutoff) {
          await fs.unlink(fullPath);
          removed += 1;
        }
        continue;
      }
      if (!isFinal(data)) continue;
      if (now - stat.mtimeMs >= defaultCutoff) {
        await fs.unlink(fullPath);
        removed += 1;
      }
    } catch (err) {
      logger.debug({ err, file }, 'Cleanup failed');
    }
  }
  if (removed) {
    logger.info({ removed }, 'Removed stale raw game files');
  }
}

function isFinal(data: any): boolean {
  try {
    const status = data?.header?.competitions?.[0]?.status ?? {};
    const type = status?.type ?? {};
    const state = type?.state;
    if (state === 'post' || Boolean(type?.completed)) return true;
    if (String(type?.name ?? '').toUpperCase() === 'STATUS_FINAL') return true;
  } catch (err) {
    logger.debug({ err }, 'Failed to detect final state');
  }
  return false;
}

async function purgeInitialRaw(): Promise<void> {
  const files = await safeList(RAW_DIR);
  let removed = 0;
  for (const file of files) {
    try {
      await fs.unlink(path.join(RAW_DIR, file));
      removed += 1;
    } catch (err) {
      logger.debug({ err, file }, 'Failed removing initial file');
    }
  }
  if (removed) {
    logger.info({ removed }, 'Purged existing raw files on start');
  }
}

async function ensureDirectories(): Promise<void> {
  await Promise.all([
    fs.mkdir(RAW_DIR, { recursive: true }),
    fs.mkdir(REFINED_DIR, { recursive: true }),
    fs.mkdir(ROSTERS_DIR, { recursive: true }),
  ]);
}

async function writeJsonAtomic(data: any, dir: string, file: string, infoLog = false): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, file);
  const tmpPath = `${filePath}.tmp`;
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tmpPath, content, 'utf8');
  await fs.rename(tmpPath, filePath);
  if (infoLog) {
    logger.info({ file: path.relative(RAW_DIR, filePath) }, 'Saved JSON');
  } else {
    logger.debug({ file: path.relative(RAW_DIR, filePath) }, 'Saved JSON');
  }
}

async function readJson(filePath: string): Promise<any | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    logger.debug({ err, filePath }, 'Failed reading JSON');
    return null;
  }
}

async function safeList(dir: string): Promise<string[]> {
  try {
    const files = await fs.readdir(dir);
    return files.filter((file) => file.toLowerCase().endsWith('.json'));
  } catch (err) {
    return [];
  }
}

async function listJsonIds(dir: string): Promise<string[]> {
  const files = await safeList(dir);
  return files.map((file) => path.parse(file).name);
}

async function cleanupOrphanRefinedGames(sourceIds: Set<string>): Promise<number> {
  const files = await safeList(REFINED_DIR);
  let removed = 0;
  for (const file of files) {
    const gid = path.parse(file).name;
    if (!sourceIds.has(gid)) {
      try {
        await fs.unlink(path.join(REFINED_DIR, file));
        removed += 1;
      } catch (err) {
        logger.debug({ err, file }, 'Failed removing orphan refined file');
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

function initTargetStats(options: { includeScoring?: boolean } = {}): Record<string, PlayerStats> {
  const out: Record<string, PlayerStats> = {};
  for (const [cat, fields] of Object.entries(DEFAULT_CATEGORIES)) {
    out[cat] = { ...fields };
  }
  if (options.includeScoring) {
    out.scoring = { ...TEAM_SCORING_DEFAULT };
  }
  return out;
}

function ensureTeamEntry(
  teams: Map<string, TeamEntry>,
  teamId: string,
  abbr: string,
  displayName: string,
  name: string,
  scores: Map<string, number>,
): TeamEntry {
  const existing = teams.get(teamId);
  if (existing) {
    if (abbr && !existing.abbreviation) existing.abbreviation = abbr;
    if (displayName && !existing.displayName) existing.displayName = displayName;
    if (name && !existing.name) existing.name = name;
    return existing;
  }
  const entry: TeamEntry = {
    teamId,
    abbreviation: abbr,
    displayName,
    name: name || displayName,
    score: scores.get(teamId) ?? 0,
  stats: initTargetStats({ includeScoring: true }),
    players: {},
    possession: false,
  };
  teams.set(teamId, entry);
  return entry;
}

function refineBoxscore(
  raw: any,
  eventId: string,
  rosterMap: Map<string, Map<string, PlayerEntry>>,
): any | null {
  const box = getBoxscoreRoot(raw);
  if (!box) {
    logger.debug({ eventId }, 'No boxscore root');
    return null;
  }

  const teams = new Map<string, TeamEntry>();
  const scores = extractScores(raw);
  const possession = extractPossession(raw);

  const playersBlocks = Array.isArray(box.players) ? box.players : [];
  for (const block of playersBlocks) {
    const teamInfo = block?.team ?? {};
    const teamId = String(teamInfo?.id ?? '');
    if (!teamId) continue;
  const abbr = teamInfo?.abbreviation ?? '';
  const displayName = teamInfo?.displayName ?? teamInfo?.name ?? '';
  const name = teamInfo?.name ?? teamInfo?.shortDisplayName ?? displayName;
  const teamEntry = ensureTeamEntry(teams, teamId, abbr, displayName, name, scores);
    teamEntry.possession = Boolean(possession.get(teamId));

    const statistics = Array.isArray(block?.statistics) ? block.statistics : [];
    for (const statCat of statistics) {
      const catName = String(statCat?.name ?? statCat?.shortName ?? statCat?.displayName ?? '').toLowerCase();
      const parsedTotals = parseCategoryTotals(statCat);
      if (parsedTotals) {
        applyCategoryMappings(teamEntry.stats, catName, parsedTotals);
      }
      const athletes = Array.isArray(statCat?.athletes) ? statCat.athletes : [];
      for (const athleteEntry of athletes) {
        const player = ensurePlayerEntry(teamEntry, athleteEntry);
        const parsed = parseAthleteStats(statCat, athleteEntry);
        applyCategoryMappings(player.stats, catName, parsed);
      }
    }
  }

  // Ensure teams exist even if no player stats
  const teamBlocks = Array.isArray(box?.teams) ? box.teams : [];
  for (const block of teamBlocks) {
    const team = block?.team ?? {};
    const teamId = String(team?.id ?? '');
    if (!teamId) continue;
  const abbr = team?.abbreviation ?? '';
  const displayName = team?.displayName ?? team?.name ?? '';
  const name = team?.name ?? team?.shortDisplayName ?? displayName;
  const teamEntry = ensureTeamEntry(teams, teamId, abbr, displayName, name, scores);
    const totalsBlock = Array.isArray(block?.statistics) ? block.statistics : [];
    for (const statCat of totalsBlock) {
      const catName = String(statCat?.name ?? '').toLowerCase();
      const parsedTotals = parseCategoryTotals(statCat);
      if (parsedTotals) {
        applyCategoryMappings(teamEntry.stats, catName, parsedTotals);
      }
    }
  }

  // Merge roster zero init
  for (const [teamId, teamEntry] of teams.entries()) {
    const rosterPlayers = rosterMap.get(teamId);
    if (!rosterPlayers) continue;
    for (const player of rosterPlayers.values()) {
      if (!teamEntry.players[player.athleteId]) {
        teamEntry.players[player.athleteId] = {
          ...player,
          stats: initTargetStats(),
        };
      }
    }
  }

  for (const teamEntry of teams.values()) {
    populateTeamScoring(teamEntry);
  }

  const teamsOut = Array.from(teams.values()).map((team) => ({
    teamId: team.teamId,
    abbreviation: team.abbreviation,
    displayName: team.displayName,
    name: team.name,
    score: team.score,
    stats: team.stats,
    players: Object.values(team.players),
    possession: team.possession,
  }));

  const { status, period } = extractStatus(raw);

  return {
    eventId,
    generatedAt: new Date().toISOString(),
    source: 'espn-nfl-boxscore',
    status,
    period,
    teams: teamsOut,
  };
}

function populateTeamScoring(teamEntry: TeamEntry): void {
  teamEntry.stats.scoring = computeTeamScoring(teamEntry);
}

function computeTeamScoring(teamEntry: TeamEntry): typeof TEAM_SCORING_DEFAULT {
  const stats = teamEntry.stats as Record<string, any>;

  const rushingTDs = numberOrZero(stats?.rushing?.rushingTouchdowns);
  const receivingTDs = numberOrZero(stats?.receiving?.receivingTouchdowns);
  const defensiveTDs = numberOrZero(stats?.defensive?.defensiveTouchdowns);
  const interceptionTDs = numberOrZero(stats?.interceptions?.interceptionTouchdowns);
  const kickReturnTDs = numberOrZero(stats?.kickReturns?.kickReturnTouchdowns);
  const puntReturnTDs = numberOrZero(stats?.puntReturns?.puntReturnTouchdowns);

  const defensiveTotal = Math.max(defensiveTDs, interceptionTDs);
  const touchdowns = rushingTDs + receivingTDs + defensiveTotal + kickReturnTDs + puntReturnTDs;

  const fieldGoals = parseMadeAttempts(stats?.kicking?.['fieldGoalsMade/fieldGoalAttempts']);
  const extraPointsMade = parseMadeAttempts(stats?.kicking?.['extraPointsMade/extraPointAttempts']);

  const baseScore = numberOrZero(teamEntry.score);
  const pointsFromTDs = touchdowns * 6;
  const pointsFromFGs = fieldGoals * 3;
  const pointsFromXPs = extraPointsMade;
  const remainder = baseScore - (pointsFromTDs + pointsFromFGs + pointsFromXPs);

  let safeties = numberOrZero(stats?.scoring?.safeties);
  if (remainder >= 2) {
    const inferred = Math.floor(remainder / 2);
    if (inferred > safeties) safeties = inferred;
  }

  return {
    touchdowns,
    fieldGoals,
    safeties,
  };
}

function parseMadeAttempts(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const [made] = value.split('/', 1);
    const parsed = Number(made);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function numberOrZero(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function getBoxscoreRoot(data: any): any | null {
  if (!data) return null;
  if (data.players && data.teams) return data;
  if (data.boxscore) return data.boxscore;
  try {
    const summary = data.summary;
    if (summary && summary.boxscore) return summary.boxscore;
  } catch (err) {
    logger.debug({ err }, 'Failed to inspect summary');
  }
  return null;
}

function extractScores(raw: any): Map<string, number> {
  const scores = new Map<string, number>();
  try {
    const comps = raw?.header?.competitions?.[0]?.competitors ?? [];
    for (const comp of comps) {
      const team = comp?.team ?? {};
      const teamId = String(team?.id ?? '');
      if (!teamId) continue;
      const score = Number(comp?.score ?? team?.score ?? 0);
      if (Number.isFinite(score)) {
        scores.set(teamId, score);
      }
    }
  } catch (err) {
    logger.debug({ err }, 'extractScores failed');
  }
  return scores;
}

function extractPossession(raw: any): Map<string, boolean> {
  const possession = new Map<string, boolean>();
  try {
    const comps = raw?.header?.competitions?.[0]?.competitors ?? [];
    for (const comp of comps) {
      const team = comp?.team ?? {};
      const teamId = String(team?.id ?? '');
      if (!teamId) continue;
      const has = Boolean(comp?.possession ?? comp?.homeAway === 'home' ? comp?.possession : comp?.possession);
      if (has) possession.set(teamId, true);
    }
  } catch (err) {
    logger.debug({ err }, 'extractPossession failed');
  }
  return possession;
}

function ensurePlayerEntry(teamEntry: TeamEntry, athleteEntry: any): PlayerEntry {
  const athlete = athleteEntry?.athlete ?? athleteEntry ?? {};
  const athleteId = String(athlete?.id ?? athleteEntry?.id ?? '');
  const key = athleteId || `name:${(athlete?.displayName ?? athlete?.fullName ?? '').toLowerCase()}`;
  const existing = teamEntry.players[key];
  if (existing) return existing;
  const position = athlete?.position ?? {};
  const headshotField = athlete?.headshot;
  const headshot = typeof headshotField === 'string' ? headshotField : headshotField?.href ?? '';
  const player: PlayerEntry = {
    athleteId: athleteId || key,
    fullName: athlete?.displayName ?? athlete?.fullName ?? '',
    position: position?.abbreviation ?? position?.name ?? '',
    jersey: athlete?.jersey ?? '',
    headshot,
    stats: initTargetStats(),
  };
  teamEntry.players[key] = player;
  return player;
}

function parseCategoryTotals(statCat: any): Record<string, any> | null {
  const keys = Array.isArray(statCat?.keys) ? statCat.keys : [];
  const totals = statCat?.totals;
  if (Array.isArray(totals) && keys.length) {
    return keys.reduce((acc: Record<string, any>, key: string, idx: number) => {
      acc[key] = coerceNumber(totals[idx]);
      return acc;
    }, {} as Record<string, any>);
  }
  if (totals && typeof totals === 'object') {
    return Object.entries(totals).reduce<Record<string, any>>((acc, [key, value]) => {
      acc[key] = coerceNumber(value);
      return acc;
    }, {});
  }
  return null;
}

function parseAthleteStats(statCat: any, athleteEntry: any): Record<string, any> {
  const keys = Array.isArray(statCat?.keys) ? statCat.keys : [];
  const statsVal = athleteEntry?.stats;
  if (Array.isArray(statsVal) && keys.length) {
    return keys.reduce((acc: Record<string, any>, key: string, idx: number) => {
      acc[key] = coerceNumber(statsVal[idx]);
      return acc;
    }, {} as Record<string, any>);
  }
  if (statsVal && typeof statsVal === 'object') {
    return Object.entries(statsVal).reduce<Record<string, any>>((acc, [key, value]) => {
      acc[key] = coerceNumber(value);
      return acc;
    }, {});
  }
  const totals = athleteEntry?.totals;
  if (Array.isArray(totals) && keys.length) {
    return keys.reduce((acc: Record<string, any>, key: string, idx: number) => {
      acc[key] = coerceNumber(totals[idx]);
      return acc;
    }, {} as Record<string, any>);
  }
  return {};
}

function applyCategoryMappings(target: Record<string, PlayerStats>, catName: string, parsed: Record<string, any>): void {
  if (!parsed || !catName) return;
  const cn = catName.replace(/\s+/g, '').toLowerCase();
  const nz = (key: string): any => coerceNumber(parsed[key]);

  if (cn === 'passing') {
    if (parsed['completions/passingAttempts']) {
      target.passing['completions/passingAttempts'] = parsed['completions/passingAttempts'];
    } else {
      const comp = nz('completions');
      const att = nz('attempts');
      if (Number.isFinite(comp) && Number.isFinite(att)) {
        target.passing['completions/passingAttempts'] = `${comp}/${att}`;
      }
    }
    target.passing.passingYards = nz('passingYards') ?? nz('yards') ?? 0;
    target.passing.yardsPerPassAttempt = nz('yardsPerPassAttempt') ?? nz('yardsPerAttempt') ?? 0;
    target.passing.passingTouchdowns = nz('passingTouchdowns') ?? nz('touchdowns') ?? 0;
    target.passing.interceptions = nz('interceptions') ?? 0;
    if (parsed['sacks-sackYardsLost']) {
      target.passing['sacks-sackYardsLost'] = parsed['sacks-sackYardsLost'];
    } else {
      const sacks = nz('sacks');
      const yards = nz('sackYardsLost');
      if (Number.isFinite(sacks) && Number.isFinite(yards)) {
        target.passing['sacks-sackYardsLost'] = `${sacks}-${yards}`;
      }
    }
    target.passing.adjQBR = nz('adjQBR') ?? nz('qbr') ?? 0;
    target.passing.QBRating = nz('QBRating') ?? nz('rating') ?? nz('passerRating') ?? 0;
    return;
  }

  if (cn === 'rushing') {
    target.rushing.rushingAttempts = nz('rushingAttempts') ?? nz('attempts') ?? 0;
    target.rushing.rushingYards = nz('rushingYards') ?? nz('yards') ?? 0;
    target.rushing.yardsPerRushAttempt = nz('yardsPerRushAttempt') ?? nz('yardsPerCarry') ?? 0;
    target.rushing.rushingTouchdowns = nz('rushingTouchdowns') ?? nz('touchdowns') ?? 0;
    target.rushing.longRushing = nz('longRushing') ?? nz('longest') ?? 0;
    return;
  }

  if (cn === 'receiving') {
    target.receiving.receptions = nz('receptions') ?? 0;
    target.receiving.receivingYards = nz('receivingYards') ?? nz('yards') ?? 0;
    target.receiving.yardsPerReception = nz('yardsPerReception') ?? 0;
    target.receiving.receivingTouchdowns = nz('receivingTouchdowns') ?? nz('touchdowns') ?? 0;
    target.receiving.longReception = nz('longReception') ?? nz('longest') ?? 0;
    target.receiving.receivingTargets = nz('receivingTargets') ?? nz('targets') ?? 0;
    return;
  }

  if (cn === 'fumbles') {
    target.fumbles.fumbles = nz('fumbles') ?? 0;
    target.fumbles.fumblesLost = nz('fumblesLost') ?? nz('lost') ?? 0;
    target.fumbles.fumblesRecovered = nz('fumblesRecovered') ?? nz('recovered') ?? 0;
    return;
  }

  if (cn === 'defense' || cn === 'defensive') {
    target.defensive.totalTackles = nz('totalTackles') ?? nz('tackles') ?? 0;
    target.defensive.soloTackles = nz('soloTackles') ?? nz('solo') ?? 0;
    target.defensive.sacks = nz('sacks') ?? 0;
    target.defensive.tacklesForLoss = nz('tacklesForLoss') ?? nz('tfl') ?? 0;
    target.defensive.passesDefended = nz('passesDefended') ?? nz('passBreakups') ?? 0;
    target.defensive.QBHits = nz('QBHits') ?? nz('quarterbackHits') ?? 0;
    target.defensive.defensiveTouchdowns = nz('defensiveTouchdowns') ?? nz('touchdowns') ?? 0;
    return;
  }

  if (cn === 'interceptions') {
    target.interceptions.interceptions = nz('interceptions') ?? 0;
    target.interceptions.interceptionYards = nz('interceptionYards') ?? nz('yards') ?? 0;
    target.interceptions.interceptionTouchdowns = nz('interceptionTouchdowns') ?? nz('touchdowns') ?? 0;
    return;
  }

  if (cn === 'kickreturns') {
    target.kickReturns.kickReturns = nz('kickReturns') ?? 0;
    target.kickReturns.kickReturnYards = nz('kickReturnYards') ?? nz('yards') ?? 0;
    target.kickReturns.yardsPerKickReturn = nz('yardsPerKickReturn') ?? 0;
    target.kickReturns.longKickReturn = nz('longKickReturn') ?? nz('longest') ?? 0;
    target.kickReturns.kickReturnTouchdowns = nz('kickReturnTouchdowns') ?? nz('touchdowns') ?? 0;
    return;
  }

  if (cn === 'puntreturns') {
    target.puntReturns.puntReturns = nz('puntReturns') ?? 0;
    target.puntReturns.puntReturnYards = nz('puntReturnYards') ?? nz('yards') ?? 0;
    target.puntReturns.yardsPerPuntReturn = nz('yardsPerPuntReturn') ?? 0;
    target.puntReturns.longPuntReturn = nz('longPuntReturn') ?? nz('longest') ?? 0;
    target.puntReturns.puntReturnTouchdowns = nz('puntReturnTouchdowns') ?? nz('touchdowns') ?? 0;
    return;
  }

  if (cn === 'kicking') {
    if (parsed['fieldGoalsMade/fieldGoalAttempts']) {
      target.kicking['fieldGoalsMade/fieldGoalAttempts'] = parsed['fieldGoalsMade/fieldGoalAttempts'];
    } else {
      const made = nz('fieldGoalsMade');
      const att = nz('fieldGoalAttempts');
      if (Number.isFinite(made) && Number.isFinite(att)) {
        target.kicking['fieldGoalsMade/fieldGoalAttempts'] = `${made}/${att}`;
      }
    }
    if (parsed['extraPointsMade/extraPointAttempts']) {
      target.kicking['extraPointsMade/extraPointAttempts'] = parsed['extraPointsMade/extraPointAttempts'];
    } else {
      const made = nz('extraPointsMade');
      const att = nz('extraPointAttempts');
      if (Number.isFinite(made) && Number.isFinite(att)) {
        target.kicking['extraPointsMade/extraPointAttempts'] = `${made}/${att}`;
      }
    }
    target.kicking.fieldGoalPct = nz('fieldGoalPct') ?? 0;
    target.kicking.longFieldGoalMade = nz('longFieldGoalMade') ?? nz('longestFieldGoal') ?? 0;
    target.kicking.totalKickingPoints = nz('totalKickingPoints') ?? nz('points') ?? 0;
    return;
  }

  if (cn === 'punting') {
    target.punting.punts = nz('punts') ?? 0;
    target.punting.puntYards = nz('puntYards') ?? nz('yards') ?? 0;
    target.punting.grossAvgPuntYards = nz('grossAvgPuntYards') ?? nz('average') ?? 0;
    target.punting.touchbacks = nz('touchbacks') ?? 0;
    target.punting.puntsInside20 = nz('puntsInside20') ?? nz('inside20') ?? 0;
    target.punting.longPunt = nz('longPunt') ?? nz('longest') ?? 0;
    return;
  }
}

function coerceNumber(value: any): any {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '--' || trimmed === '-') return 0;
    const cleaned = trimmed.replace(/,/g, '');
    const num = Number(cleaned);
    if (Number.isFinite(num)) return num;
  }
  return value;
}

async function loadRosterPlayers(): Promise<Map<string, Map<string, PlayerEntry>>> {
  const result = new Map<string, Map<string, PlayerEntry>>();
  const files = await safeList(ROSTERS_DIR);
  for (const file of files) {
    try {
      const data = await readJson(path.join(ROSTERS_DIR, file));
      if (!data) continue;
      const teamId = path.parse(file).name;
      const playersMap = new Map<string, PlayerEntry>();
      const groups = Array.isArray(data?.athletes) ? data.athletes : [];
      for (const group of groups) {
        const items = Array.isArray(group?.items) ? group.items : [];
        for (const item of items) {
          const athleteId = String(item?.id ?? '');
          const position = item?.position ?? {};
          const headshotField = item?.headshot;
          const headshot = typeof headshotField === 'string' ? headshotField : headshotField?.href ?? '';
          if (!athleteId) continue;
          playersMap.set(athleteId, {
            athleteId,
            fullName: item?.displayName ?? item?.fullName ?? '',
            position: position?.abbreviation ?? position?.name ?? '',
            jersey: item?.jersey ?? '',
            headshot,
            stats: initTargetStats(),
          });
        }
      }
      result.set(teamId, playersMap);
    } catch (err) {
      logger.debug({ err, file }, 'Failed loading roster');
    }
  }
  return result;
}

function extractStatus(raw: any): { status: string; period: number | null } {
  try {
    const status = raw?.header?.competitions?.[0]?.status ?? {};
    const type = status?.type ?? {};
    const name = String(type?.name ?? type?.description ?? '').toUpperCase();
    const period = status?.period ?? null;
    return {
      status: name || 'STATUS_UNKNOWN',
      period: Number.isFinite(period) ? period : null,
    };
  } catch (err) {
    logger.debug({ err }, 'extractStatus failed');
    return { status: 'STATUS_UNKNOWN', period: null };
  }
}
