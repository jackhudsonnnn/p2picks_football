import { promises as fs } from 'fs';
import * as path from 'path';
import {
  StatCategory,
  findPlayer,
  findTeam,
  getCategory,
  loadRefinedGame,
  REFINED_DIR,
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
            results[gameId] = gameId;
          }
        } catch {
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
