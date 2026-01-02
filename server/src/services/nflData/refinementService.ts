/**
 * NFL boxscore refinement service.
 * Transforms raw ESPN boxscore data into a normalized, usable format.
 */

import { createLogger } from '../../utils/logger';
import type { PlayerEntry } from './rosterService';

const logger = createLogger('refinementService');

type PlayerStats = Record<string, unknown>;

interface TeamEntry {
  teamId: string;
  abbreviation: string;
  displayName: string;
  name: string;
  score: number;
  stats: Record<string, PlayerStats>;
  players: Record<string, RefinedPlayerEntry>;
  possession: boolean;
  homeAway: 'home' | 'away' | '';
}

interface RefinedPlayerEntry {
  athleteId: string;
  fullName: string;
  position: string;
  jersey: string;
  headshot: string;
  stats: Record<string, PlayerStats>;
}

export interface RefinedGame {
  eventId: string;
  generatedAt: string;
  source: string;
  status: string;
  period: number | null;
  teams: Array<{
    teamId: string;
    abbreviation: string;
    displayName: string;
    name: string;
    score: number;
    stats: Record<string, PlayerStats>;
    players: RefinedPlayerEntry[];
    possession: boolean;
    homeAway: 'home' | 'away' | '';
  }>;
}

const DEFAULT_CATEGORIES: Record<string, Record<string, unknown>> = {
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

/**
 * Refine a raw ESPN boxscore into our normalized format.
 */
export function refineBoxscore(
  raw: unknown,
  eventId: string,
  rosterMap: Map<string, Map<string, PlayerEntry>>
): RefinedGame | null {
  const box = getBoxscoreRoot(raw);
  if (!box) {
    logger.debug({ eventId }, 'No boxscore root');
    return null;
  }

  const teams = new Map<string, TeamEntry>();
  const scores = extractScores(raw);
  const possession = extractPossession(raw);
  const homeAway = extractHomeAway(raw);

  const playersBlocks = Array.isArray(box.players) ? box.players : [];
  for (const block of playersBlocks) {
    const blockObj = block as Record<string, unknown>;
    const teamInfo = (blockObj.team as Record<string, unknown>) ?? {};
    const teamId = String(teamInfo.id ?? '');
    if (!teamId) continue;

    const abbr = String(teamInfo.abbreviation ?? '');
    const displayName = String(teamInfo.displayName ?? teamInfo.name ?? '');
    const name = String(teamInfo.name ?? teamInfo.shortDisplayName ?? displayName);
    const teamEntry = ensureTeamEntry(
      teams,
      teamId,
      abbr,
      displayName,
      name,
      scores,
      homeAway.get(teamId)
    );
    teamEntry.possession = Boolean(possession.get(teamId));

    const statistics = Array.isArray(blockObj.statistics) ? blockObj.statistics : [];
    const rosterPlayers = rosterMap.get(teamId);

    for (const statCat of statistics) {
      const statObj = statCat as Record<string, unknown>;
      const catName = String(
        statObj.name ?? statObj.shortName ?? statObj.displayName ?? ''
      ).toLowerCase();
      const parsedTotals = parseCategoryTotals(statObj);
      if (parsedTotals) {
        applyCategoryMappings(teamEntry.stats, catName, parsedTotals);
      }
      const athletes = Array.isArray(statObj.athletes) ? statObj.athletes : [];
      for (const athleteEntry of athletes) {
        const player = ensurePlayerEntry(teamEntry, athleteEntry, rosterPlayers);
        const parsed = parseAthleteStats(statObj, athleteEntry);
        applyCategoryMappings(player.stats, catName, parsed);
      }
    }
  }

  // Ensure teams exist even if no player stats
  const teamBlocks = Array.isArray(box.teams) ? box.teams : [];
  for (const block of teamBlocks) {
    const blockObj = block as Record<string, unknown>;
    const team = (blockObj.team as Record<string, unknown>) ?? {};
    const teamId = String(team.id ?? '');
    if (!teamId) continue;

    const abbr = String(team.abbreviation ?? '');
    const displayName = String(team.displayName ?? team.name ?? '');
    const name = String(team.name ?? team.shortDisplayName ?? displayName);
    const teamEntry = ensureTeamEntry(
      teams,
      teamId,
      abbr,
      displayName,
      name,
      scores,
      homeAway.get(teamId)
    );

    const totalsBlock = Array.isArray(blockObj.statistics) ? blockObj.statistics : [];
    const rosterPlayers = rosterMap.get(teamId);

    for (const statCat of totalsBlock) {
      const statObj = statCat as Record<string, unknown>;
      const catName = String(statObj.name ?? '').toLowerCase();
      const parsedTotals = parseCategoryTotals(statObj);
      if (parsedTotals) {
        applyCategoryMappings(teamEntry.stats, catName, parsedTotals);
      }
    }

    if (rosterPlayers) {
      for (const rosterPlayer of rosterPlayers.values()) {
        const existing = teamEntry.players[rosterPlayer.athleteId];
        if (existing) {
          existing.athleteId = rosterPlayer.athleteId;
          existing.fullName = rosterPlayer.fullName || existing.fullName;
          existing.position = rosterPlayer.position || existing.position;
          existing.jersey = rosterPlayer.jersey || existing.jersey;
          existing.headshot = rosterPlayer.headshot || existing.headshot;
        } else {
          teamEntry.players[rosterPlayer.athleteId] = {
            ...rosterPlayer,
            stats: initTargetStats(),
          };
        }
      }
    }
  }

  // Merge roster zero init
  for (const [teamId, teamEntry] of teams.entries()) {
    const rosterPlayers = rosterMap.get(teamId);
    if (!rosterPlayers) continue;
    for (const player of rosterPlayers.values()) {
      const existing = teamEntry.players[player.athleteId];
      if (existing) {
        existing.athleteId = player.athleteId;
        existing.fullName = player.fullName || existing.fullName;
        existing.position = player.position || existing.position;
        existing.jersey = player.jersey || existing.jersey;
        existing.headshot = player.headshot || existing.headshot;
        continue;
      }
      teamEntry.players[player.athleteId] = {
        ...player,
        stats: initTargetStats(),
      };
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
    homeAway: team.homeAway,
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
  homeAway?: string
): TeamEntry {
  const existing = teams.get(teamId);
  if (existing) {
    if (abbr && !existing.abbreviation) existing.abbreviation = abbr;
    if (displayName && !existing.displayName) existing.displayName = displayName;
    if (name && !existing.name) existing.name = name;
    const normalized = normalizeHomeAway(homeAway);
    if (normalized && !existing.homeAway) existing.homeAway = normalized;
    return existing;
  }
  const normalized = normalizeHomeAway(homeAway);
  const entry: TeamEntry = {
    teamId,
    abbreviation: abbr,
    displayName,
    name: name || displayName,
    score: scores.get(teamId) ?? 0,
    stats: initTargetStats({ includeScoring: true }),
    players: {},
    possession: false,
    homeAway: normalized,
  };
  teams.set(teamId, entry);
  return entry;
}

function normalizeHomeAway(value: unknown): 'home' | 'away' | '' {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'home') return 'home';
  if (v === 'away') return 'away';
  return '';
}

function getBoxscoreRoot(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  if (obj.players && obj.teams) return obj;
  if (obj.boxscore) return obj.boxscore as Record<string, unknown>;
  try {
    const summary = obj.summary as Record<string, unknown>;
    if (summary?.boxscore) return summary.boxscore as Record<string, unknown>;
  } catch (err) {
    logger.debug({ err }, 'Failed to inspect summary');
  }
  return null;
}

function extractScores(raw: unknown): Map<string, number> {
  const scores = new Map<string, number>();
  try {
    const obj = raw as Record<string, unknown>;
    const header = obj.header as Record<string, unknown>;
    const competitions = header?.competitions as unknown[];
    const comp0 = competitions?.[0] as Record<string, unknown>;
    const comps = (comp0?.competitors as unknown[]) ?? [];
    for (const comp of comps) {
      const compObj = comp as Record<string, unknown>;
      const team = compObj.team as Record<string, unknown>;
      const teamId = String(team?.id ?? '');
      if (!teamId) continue;
      const score = Number(compObj.score ?? team?.score ?? 0);
      if (Number.isFinite(score)) {
        scores.set(teamId, score);
      }
    }
  } catch (err) {
    logger.debug({ err }, 'extractScores failed');
  }
  return scores;
}

function extractPossession(raw: unknown): Map<string, boolean> {
  const possession = new Map<string, boolean>();
  try {
    const obj = raw as Record<string, unknown>;
    const header = obj.header as Record<string, unknown>;
    const competitions = header?.competitions as unknown[];
    const comp0 = competitions?.[0] as Record<string, unknown>;
    const comps = (comp0?.competitors as unknown[]) ?? [];
    for (const comp of comps) {
      const compObj = comp as Record<string, unknown>;
      const team = compObj.team as Record<string, unknown>;
      const teamId = String(team?.id ?? '');
      if (!teamId) continue;
      const has = Boolean(compObj.possession);
      if (has) possession.set(teamId, true);
    }
  } catch (err) {
    logger.debug({ err }, 'extractPossession failed');
  }
  return possession;
}

function extractHomeAway(raw: unknown): Map<string, 'home' | 'away'> {
  const mapping = new Map<string, 'home' | 'away'>();
  try {
    const obj = raw as Record<string, unknown>;
    const header = obj.header as Record<string, unknown>;
    const competitions = header?.competitions as unknown[];
    const comp0 = competitions?.[0] as Record<string, unknown>;
    const comps = (comp0?.competitors as unknown[]) ?? [];
    for (const comp of comps) {
      const compObj = comp as Record<string, unknown>;
      const team = compObj.team as Record<string, unknown>;
      const teamId = String(team?.id ?? '');
      if (!teamId) continue;
      const normalized = normalizeHomeAway(
        compObj.homeAway ?? (compObj.isHome ? 'home' : compObj.isAway ? 'away' : '')
      );
      if (normalized) mapping.set(teamId, normalized);
    }
  } catch (err) {
    logger.debug({ err }, 'extractHomeAway from header failed');
  }

  // Fallback to boxscore teams block
  try {
    const box = getBoxscoreRoot(raw);
    const teams = Array.isArray(box?.teams) ? box!.teams : [];
    for (const block of teams) {
      const blockObj = block as Record<string, unknown>;
      const team = (blockObj.team as Record<string, unknown>) ?? {};
      const teamId = String(team.id ?? '');
      if (!teamId || mapping.has(teamId)) continue;
      const normalized = normalizeHomeAway(
        (blockObj.homeAway as string | undefined) ?? (blockObj.homeaway as string | undefined)
      );
      if (normalized) mapping.set(teamId, normalized);
    }
  } catch (err) {
    logger.debug({ err }, 'extractHomeAway from boxscore failed');
  }

  return mapping;
}

function extractStatus(raw: unknown): { status: string; period: number | null } {
  try {
    const obj = raw as Record<string, unknown>;
    const header = obj.header as Record<string, unknown>;
    const competitions = header?.competitions as unknown[];
    const comp0 = competitions?.[0] as Record<string, unknown>;
    const status = comp0?.status as Record<string, unknown>;
    const type = status?.type as Record<string, unknown>;
    const name = String(type?.name ?? type?.description ?? '').toUpperCase();
    const period = status?.period as number | undefined;
    return {
      status: name || 'STATUS_UNKNOWN',
      period: Number.isFinite(period) ? period! : null,
    };
  } catch (err) {
    logger.debug({ err }, 'extractStatus failed');
    return { status: 'STATUS_UNKNOWN', period: null };
  }
}

function ensurePlayerEntry(
  teamEntry: TeamEntry,
  athleteEntry: unknown,
  rosterPlayers?: Map<string, PlayerEntry>
): RefinedPlayerEntry {
  const entryObj = athleteEntry as Record<string, unknown>;
  const athlete = (entryObj.athlete as Record<string, unknown>) ?? entryObj ?? {};
  const athleteId = String(athlete.id ?? entryObj.id ?? '');
  const rosterSource = athleteId && rosterPlayers ? rosterPlayers.get(athleteId) : undefined;
  const fallbackKey = `name:${String(athlete.displayName ?? athlete.fullName ?? '').toLowerCase()}`;
  const key = rosterSource?.athleteId || athleteId || fallbackKey;
  const existing = teamEntry.players[key];

  if (existing) {
    if (rosterSource) {
      existing.athleteId = rosterSource.athleteId;
      existing.fullName = rosterSource.fullName || existing.fullName;
      existing.position = rosterSource.position || existing.position;
      existing.jersey = rosterSource.jersey || existing.jersey;
      existing.headshot = rosterSource.headshot || existing.headshot;
    } else {
      const position = (athlete.position as Record<string, unknown>) ?? {};
      const headshotField = athlete.headshot;
      const headshot =
        typeof headshotField === 'string'
          ? headshotField
          : (headshotField as Record<string, unknown>)?.href ?? existing.headshot;
      existing.fullName = String(athlete.displayName ?? athlete.fullName ?? existing.fullName);
      existing.position =
        existing.position || String(position.abbreviation ?? position.name ?? '');
      existing.jersey = existing.jersey || String(athlete.jersey ?? '');
      existing.headshot = String(headshot || existing.headshot);
    }
    return existing;
  }

  const position = (athlete.position as Record<string, unknown>) ?? {};
  const headshotField = athlete.headshot;
  const headshot =
    typeof headshotField === 'string'
      ? headshotField
      : (headshotField as Record<string, unknown>)?.href ?? '';

  if (rosterSource) {
    const player: RefinedPlayerEntry = {
      athleteId: rosterSource.athleteId,
      fullName: rosterSource.fullName || String(athlete.displayName ?? athlete.fullName ?? ''),
      position: rosterSource.position || String(position.abbreviation ?? position.name ?? ''),
      jersey: rosterSource.jersey || String(athlete.jersey ?? ''),
      headshot: rosterSource.headshot || String(headshot),
      stats: initTargetStats(),
    };
    teamEntry.players[rosterSource.athleteId] = player;
    return player;
  }

  const player: RefinedPlayerEntry = {
    athleteId: athleteId || fallbackKey,
    fullName: String(athlete.displayName ?? athlete.fullName ?? ''),
    position: String(position.abbreviation ?? position.name ?? ''),
    jersey: String(athlete.jersey ?? ''),
    headshot: String(headshot),
    stats: initTargetStats(),
  };
  teamEntry.players[key] = player;
  return player;
}

function parseCategoryTotals(statCat: Record<string, unknown>): Record<string, unknown> | null {
  const keys = Array.isArray(statCat.keys) ? (statCat.keys as string[]) : [];
  const totals = statCat.totals;
  if (Array.isArray(totals) && keys.length) {
    return keys.reduce((acc: Record<string, unknown>, key: string, idx: number) => {
      acc[key] = coerceNumber(totals[idx]);
      return acc;
    }, {});
  }
  if (totals && typeof totals === 'object') {
    return Object.entries(totals as Record<string, unknown>).reduce<Record<string, unknown>>(
      (acc, [key, value]) => {
        acc[key] = coerceNumber(value);
        return acc;
      },
      {}
    );
  }
  return null;
}

function parseAthleteStats(
  statCat: Record<string, unknown>,
  athleteEntry: unknown
): Record<string, unknown> {
  const entryObj = athleteEntry as Record<string, unknown>;
  const keys = Array.isArray(statCat.keys) ? (statCat.keys as string[]) : [];
  const statsVal = entryObj.stats;
  if (Array.isArray(statsVal) && keys.length) {
    return keys.reduce((acc: Record<string, unknown>, key: string, idx: number) => {
      acc[key] = coerceNumber(statsVal[idx]);
      return acc;
    }, {});
  }
  if (statsVal && typeof statsVal === 'object') {
    return Object.entries(statsVal as Record<string, unknown>).reduce<Record<string, unknown>>(
      (acc, [key, value]) => {
        acc[key] = coerceNumber(value);
        return acc;
      },
      {}
    );
  }
  const totals = entryObj.totals;
  if (Array.isArray(totals) && keys.length) {
    return keys.reduce((acc: Record<string, unknown>, key: string, idx: number) => {
      acc[key] = coerceNumber(totals[idx]);
      return acc;
    }, {});
  }
  return {};
}

function applyCategoryMappings(
  target: Record<string, PlayerStats>,
  catName: string,
  parsed: Record<string, unknown>
): void {
  if (!parsed || !catName) return;
  const cn = catName.replace(/\s+/g, '').toLowerCase();
  const nz = (key: string): unknown => coerceNumber(parsed[key]);

  if (cn === 'passing') {
    if (parsed['completions/passingAttempts']) {
      target.passing['completions/passingAttempts'] = parsed['completions/passingAttempts'];
    } else {
      const comp = nz('completions') as number;
      const att = nz('attempts') as number;
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
      const sacks = nz('sacks') as number;
      const yards = nz('sackYardsLost') as number;
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
      const made = nz('fieldGoalsMade') as number;
      const att = nz('fieldGoalAttempts') as number;
      if (Number.isFinite(made) && Number.isFinite(att)) {
        target.kicking['fieldGoalsMade/fieldGoalAttempts'] = `${made}/${att}`;
      }
    }
    if (parsed['extraPointsMade/extraPointAttempts']) {
      target.kicking['extraPointsMade/extraPointAttempts'] = parsed['extraPointsMade/extraPointAttempts'];
    } else {
      const made = nz('extraPointsMade') as number;
      const att = nz('extraPointAttempts') as number;
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

function coerceNumber(value: unknown): unknown {
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

function populateTeamScoring(teamEntry: TeamEntry): void {
  teamEntry.stats.scoring = computeTeamScoring(teamEntry);
}

function computeTeamScoring(teamEntry: TeamEntry): typeof TEAM_SCORING_DEFAULT {
  const stats = teamEntry.stats as Record<string, Record<string, unknown>>;

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
