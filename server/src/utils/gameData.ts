import { promises as fs } from 'fs';
import * as path from 'path';

export const REFINED_DIR = path.join('src', 'data', 'nfl_refined_live_stats');

export type StatCategory =
  | 'passing'
  | 'rushing'
  | 'receiving'
  | 'fumbles'
  | 'defensive'
  | 'interceptions'
  | 'kickReturns'
  | 'puntReturns'
  | 'kicking'
  | 'punting'
  | 'scoring';

export interface StatsByCategory {
  [category: string]: Record<string, unknown>;
}

export interface Player {
  athleteId: string;
  fullName: string;
  position: string;
  jersey: string;
  headshot: string;
  stats: StatsByCategory;
}

export interface Team {
  teamId: string;
  abbreviation: string;
  displayName: string;
  score: number;
  stats: StatsByCategory;
  players: Player[];
  homeAway?: string;
  displayOrder?: number;
  possession?: boolean;
}

export interface RefinedGameDoc {
  eventId: string;
  generatedAt: string;
  source?: string;
  status?: string; // e.g., STATUS_IN_PROGRESS, STATUS_FINAL, STATUS_HALFTIME, STATUS_SCHEDULED
  period?: number | null;
  teams: Team[];
  note?: string;
}

export function resolveGamePath(gameId: string): string {
  // If DATA_REFINED_DIR is absolute, use it directly; else resolve from repo root
  const base = path.isAbsolute(REFINED_DIR) ? REFINED_DIR : path.join(process.cwd(), REFINED_DIR);
  return path.join(base, `${gameId}.json`);
}

export async function readJson<T = unknown>(filePath: string): Promise<T> {
  const data = await fs.readFile(filePath, 'utf8');
  return JSON.parse(data) as T;
}

export async function loadRefinedGame(gameId: string): Promise<RefinedGameDoc | null> {
  try {
    return await readJson<RefinedGameDoc>(resolveGamePath(gameId));
  } catch (err: any) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
}

export function findPlayer(doc: RefinedGameDoc, playerId: string): Player | null {
  for (const team of doc.teams || []) {
    const players = (team as any).players as any;
    if (!players) continue;
    if (!Array.isArray(players)) {
      const direct = (players as Record<string, Player>)[playerId];
      if (direct) return direct;
      for (const candidate of Object.values(players as Record<string, Player>)) {
        if (candidate.athleteId === playerId) return candidate;
      }
    } else {
      for (const candidate of players as Player[]) {
        if (candidate.athleteId === playerId) return candidate;
        if (`name:${candidate.fullName}` === playerId) return candidate;
      }
    }
  }
  return null;
}

export function findTeam(doc: RefinedGameDoc, teamId: string): Team | null {
  return (
    doc.teams.find(
      (t) => (t as any).teamId === teamId || (t as any).abbreviation === teamId,
    ) || null
  );
}

export function getCategory(
  statsByCategory: Record<string, Record<string, unknown>>,
  category: string,
): Record<string, unknown> | undefined {
  if (!statsByCategory) return undefined;
  const direct = (statsByCategory as any)[category];
  if (direct) return direct;
  const lower = category.toLowerCase();
  for (const [k, v] of Object.entries(statsByCategory)) {
    if (k.toLowerCase() === lower) return v as Record<string, unknown>;
  }
  return undefined;
}
