import { promises as fs } from 'fs';
import * as path from 'path';
import {
  StatCategory,
  findPlayer,
  findTeam,
  getCategory,
  loadRefinedGame,
  REFINED_DIR,
  RefinedGameDoc,
} from './helpers';

export async function listAvailableGames(): Promise<Record<string, string>> {
  try {
    const dir = path.isAbsolute(REFINED_DIR) ? REFINED_DIR : path.join(process.cwd(), REFINED_DIR);
    const files = await fs.readdir(dir, { withFileTypes: true } as any);
    const jsonFiles = files
      .filter((d: any) => d.isFile() && d.name.endsWith('.json'))
      .map((d: any) => d.name.replace(/\.json$/i, ''));

    const results: Record<string, string> = {};
    await Promise.all(
      jsonFiles.map(async (gameId: string) => {
        try {
          const doc = await loadRefinedGame(gameId);
          if (doc && Array.isArray(doc.teams) && doc.teams.length >= 2) {
            const a = (doc.teams[0] as any)?.displayName || '';
            const b = (doc.teams[1] as any)?.displayName || '';
            results[gameId] = `${a} vs ${b}`.trim();
          } else if (doc && Array.isArray(doc.teams) && doc.teams.length === 1) {
            const a = (doc.teams[0] as any)?.displayName || '';
            results[gameId] = `${a}`;
          } else {
            console.warn(`Warning: Refined game file for gameId ${gameId} has no teams array`);
            results[gameId] = gameId;
          }
        } catch {
          console.warn(`Warning: Could not load or parse refined game file for gameId ${gameId}`);
          results[gameId] = gameId;
        }
      })
    );

    return results;
  } catch (err: any) {
    if (err?.code === 'ENOENT') return {};
    throw err;
  }
}

export async function listPlayers(gameId: string): Promise<Record<string, string>> {
  const doc = await loadRefinedGame(gameId);
  if (!doc) return {};
  const result: Record<string, string> = {};
  for (const team of (doc.teams as any) || []) {
    const teamPlayers: any = (team as any).players;
    if (!teamPlayers) continue;
    if (Array.isArray(teamPlayers)) {
      for (const p of teamPlayers as any[]) {
        if (!p) continue;
        const id = (p as any).athleteId;
        const name = (p as any).fullName || '';
        if (id) result[id] = name;
        if (name) result[`name:${name}`] = name;
      }
    } else {
      for (const [key, p] of Object.entries(teamPlayers as Record<string, any>)) {
        const id = (p as any)?.athleteId || key;
        const name = (p as any)?.fullName || String(key).replace(/^name:/, '');
        if (id) result[id] = name;
        result[key] = name;
      }
    }
  }
  return result;
}

export async function getGameTeams(gameId: string): Promise<Array<Record<string, string>>> {
  const doc = await loadRefinedGame(gameId);
  if (!doc || !Array.isArray(doc.teams)) return [];
  return (doc.teams as any[]).map((t) => ({
    teamId: (t as any).teamId || (t as any).abbreviation || '',
    abbreviation: (t as any).abbreviation || '',
    displayName: (t as any).displayName || '',
  }));
}

export function getModeDescription(mode: string): object {
  switch (mode) {
    case 'passing':
      return {
        'completions/passingAttempts': 'Completions/Attempts',
        passingYards: 'Passing Yards',
        yardsPerPassAttempt: 'Yards/Attempt',
        passingTouchdowns: 'Passing Touchdowns',
        interceptions: 'Interceptions Thrown',
        'sacks-sackYardsLost': 'Sacks/Sack Yards Lost',
        adjQBR: 'Adjusted Quarterback Rating',
        QBRating: 'Quarterback Rating',
      };
    case 'rushing':
      return {
        rushingAttempts: 'Rushing Attempts',
        rushingYards: 'Rushing Yards',
        yardsPerRushAttempt: 'Yards/Rushing Attempt',
        rushingTouchdowns: 'Rushing Touchdowns',
        longRushing: 'Longest Run',
      };
    case 'receiving':
      return {
        receptions: 'Receptions',
        receivingYards: 'Receiving Yards',
        yardsPerReception: 'Yards/Reception',
        receivingTouchdowns: 'Receiving Touchdowns',
        longReception: 'Longest Reception',
        receivingTargets: 'Receiving Targets',
      };
    case 'fumbles':
      return {
        fumbles: 'Fumbles',
        fumblesLost: 'Fumbles Lost',
        fumblesRecovered: 'Fumbles Recovered',
      };
    case 'defensive':
      return {
        totalTackles: 'Total Tackles',
        soloTackles: 'Solo Tackles',
        sacks: 'Sacks',
        tacklesForLoss: 'Tackles For Loss',
        passesDefended: 'Passes Defended',
        QBHits: 'Quarterback Hits',
        defensiveTouchdowns: 'Defensive Touchdowns',
      };
    case 'interceptions':
      return {
        interceptions: 'Interceptions',
        interceptionYards: 'Interception Yards',
        interceptionTouchdowns: 'Interception Touchdowns',
      };
    case 'kickReturns':
      return {
        kickReturns: 'Kick Returns',
        kickReturnYards: 'Kick Return Yards',
        yardsPerKickReturn: 'Yards/Kick Return',
        longKickReturn: 'Longest Kick Return',
        kickReturnTouchdowns: 'Kick Return Touchdowns',
      };
    case 'puntReturns':
      return {
        puntReturns: 'Punt Returns',
        puntReturnYards: 'Punt Return Yards',
        yardsPerPuntReturn: 'Yards/Punt Return',
        longPuntReturn: 'Longest Punt Return',
        puntReturnTouchdowns: 'Punt Return Touchdowns',
      };
    case 'kicking':
      return {
        'fieldGoalsMade/fieldGoalAttempts': 'Field Goals Made/Attempts',
        fieldGoalPct: 'Field Goal Percentage',
        longFieldGoalMade: 'Longest Field Goal Made',
        'extraPointsMade/extraPointAttempts': 'Extra Points Made/Attempts',
        totalKickingPoints: 'Total Kicking Points',
      };
    case 'punting':
      return {
        punts: 'Punts',
        puntYards: 'Punt Yards',
        grossAvgPuntYards: 'Gross Avg Punt Yards',
        touchbacks: 'Touchbacks',
        puntsInside20: 'Punts Inside 20',
        longPunt: 'Longest Punt',
      };
    default:
      return { 'Unknown mode': mode } as object;
  }
}

export async function getPlayerCategoryStats(
  gameId: string,
  playerId: string,
  category: StatCategory,
): Promise<Record<string, unknown>> {
  const doc = await loadRefinedGame(gameId);
  if (!doc) return {};
  const player = findPlayer(doc, playerId);
  if (!player) return {} as any;
  return getCategory((player as any).stats, category) || {};
}

export async function getTeamCategoryStats(
  gameId: string,
  teamId: string,
  category: StatCategory,
): Promise<Record<string, unknown>> {
  const doc = await loadRefinedGame(gameId);
  if (!doc) return {};
  const team = findTeam(doc, teamId);
  if (!team) return {} as any;
  return getCategory((team as any).stats, category) || {};
}

export async function getCurrentPossession(gameId: string): Promise<Record<string, unknown> | null> {
  const doc = await loadRefinedGame(gameId);
  if (!doc) return null;
  const pos: any = (doc as any).possession || null;
  if (!pos || typeof pos !== 'object') return null;
  return pos as Record<string, unknown>;
}

export async function getGameStatus(gameId: string, prefetchedDoc?: RefinedGameDoc | null): Promise<string | null> {
  let doc: RefinedGameDoc | null = prefetchedDoc ?? null;
  if (!doc) {
    try {
      doc = await loadRefinedGame(gameId);
    } catch (err) {
      return null;
    }
  }
  if (!doc) return null;

  const raw: any = (doc as any).status || null;
  if (!raw) return null;

  return String(raw);
}

export async function getTeamScoreStats(
  gameId: string,
  teamId: string,
  prefetchedDoc?: RefinedGameDoc | null,
): Promise<{
  score: number;
  touchdowns: number;
  fieldGoalsMade: number;
  extraPointsMade: number;
  safeties: number;
}> {
  const debug = process.env.DEBUG_SCORE_STATS === '1' || process.env.DEBUG_SCORE_STATS === 'true';
  const log = (...args: any[]) => {
    if (debug) console.log('[score-stats]', ...args);
  };

  log('requested', { gameId, teamId });
  let doc: any = prefetchedDoc ?? null;
  if (!doc) {
    try {
      doc = await loadRefinedGame(gameId);
    } catch (err) {
      log('error loading game', err);
    }
  }
  if (!doc) {
    log('no game doc found');
    return { score: 0, touchdowns: 0, fieldGoalsMade: 0, extraPointsMade: 0, safeties: 0 };
  }
  const team: any = findTeam(doc, teamId);
  if (!team) {
    log('team not found among teams', (doc.teams || []).map((t: any) => ({ teamId: t.teamId, abbreviation: t.abbreviation })));
    return { score: 0, touchdowns: 0, fieldGoalsMade: 0, extraPointsMade: 0, safeties: 0 };
  }

  const stats = (team as any).stats || {};
  const scoringCat = stats?.scoring;
  log('raw team score + stats keys', { score: team.score, statCategories: Object.keys(stats) });
  let touchdowns: number;
  let fieldGoalsMade: number | undefined;
  let safeties: number | undefined;
  if (scoringCat) {
    touchdowns = Number(scoringCat.touchdowns || 0);
    fieldGoalsMade = Number(scoringCat.fieldGoals || 0);
    safeties = Number(scoringCat.safeties || 0);
    log('using scoring category', { touchdowns, fieldGoalsMade, safeties });
  } else {
    const rushingTD = Number(stats?.rushing?.rushingTouchdowns || 0);
    const receivingTD = Number(stats?.receiving?.receivingTouchdowns || 0);
    const defensiveTD = Number(stats?.defensive?.defensiveTouchdowns || 0);
    const kickRetTD = Number(stats?.kickReturns?.kickReturnTouchdowns || 0);
    const puntRetTD = Number(stats?.puntReturns?.puntReturnTouchdowns || 0);
    touchdowns = rushingTD + receivingTD + defensiveTD + kickRetTD + puntRetTD;
    safeties = 0; // legacy path guesses later
    log('touchdown breakdown (legacy path)', { rushingTD, receivingTD, defensiveTD, kickRetTD, puntRetTD, total: touchdowns });
  }

  const kicking = stats?.kicking || {};
  const fgRaw: string = kicking['fieldGoalsMade/fieldGoalAttempts'] || '0/0';
  const xpRaw: string = kicking['extraPointsMade/extraPointAttempts'] || '0/0';
  const fieldGoalsMadeKicking = parseInt(String(fgRaw).split('/')[0]) || 0;
  const extraPointsMade = parseInt(String(xpRaw).split('/')[0]) || 0;
  // If scoring category already gave us fieldGoals, trust that count; else derive from kicking stats
  if (scoringCat) {
    // ensure fieldGoalsMade aligns with kicks made if mismatch (keep scoring count authoritative)
    if (typeof fieldGoalsMade === 'number' && fieldGoalsMade !== fieldGoalsMadeKicking) {
      log('field goal count mismatch', { scoringCatFieldGoals: fieldGoalsMade, kickingDerived: fieldGoalsMadeKicking });
    }
  } else {
    fieldGoalsMade = fieldGoalsMadeKicking;
  }
  // Ensure fieldGoalsMade is defined
  if (typeof fieldGoalsMade !== 'number') fieldGoalsMade = fieldGoalsMadeKicking;
  if (typeof safeties !== 'number') safeties = 0;
  log('kicking parsed', { fgRaw, xpRaw, fieldGoalsMade, extraPointsMade });

  const score: number = Number(team.score || 0);
  const pointsFromTDs = touchdowns * 6;
  const pointsFromFGs = fieldGoalsMade * 3;
  const pointsFromXPs = extraPointsMade * 1;
  const remainder = score - (pointsFromTDs + pointsFromFGs + pointsFromXPs);
  let inferredSafeties = 0;
  if (!scoringCat) { // only infer safeties in legacy path
    if (remainder >= 2) inferredSafeties = Math.floor(remainder / 2);
    if (!safeties) safeties = inferredSafeties;
  }
  log('computed distribution', { score, pointsFromTDs, pointsFromFGs, pointsFromXPs, remainder, safeties });

  const payload = { score, touchdowns, fieldGoalsMade, extraPointsMade, safeties: safeties || 0 };
  log('return payload', payload);
  return payload;
}
