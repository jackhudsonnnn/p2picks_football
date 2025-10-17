import { promises as fs } from 'fs';
import * as path from 'path';
import { findTeam, loadRefinedGame, REFINED_DIR } from '../helpers';
import type { RefinedGameDoc } from '../helpers';

export async function getAvailableGames(): Promise<Record<string, string>> {
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
            const a = (doc.teams[0] as any)?.name || '';
            const b = (doc.teams[1] as any)?.name || '';
            results[gameId] = `${a} vs ${b}`.trim();
          } else if (doc && Array.isArray(doc.teams) && doc.teams.length === 1) {
            const a = (doc.teams[0] as any)?.name || '';
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

export async function getGameTeams(gameId: string): Promise<Array<Record<string, string>>> {
  const doc = await loadRefinedGame(gameId);
  if (!doc || !Array.isArray(doc.teams)) return [];
  return (doc.teams as any[]).map((t) => ({
    teamId: (t as any).teamId || (t as any).abbreviation || '',
    abbreviation: (t as any).abbreviation || '',
    name: (t as any).name || '',
  }));
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

  const status: any = (doc as any).status || null;
  if (!status) return null;

  return String(status);
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
