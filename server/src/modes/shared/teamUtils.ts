import type { RefinedGameDoc, Team } from '../../services/nflData/nflRefinedDataAccessors';

export function listTeams(doc: RefinedGameDoc | null | undefined): Team[] {
  if (!doc || !Array.isArray(doc.teams)) return [];
  return doc.teams as Team[];
}

export function normalizeTeamId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str ? str : null;
}

export function choiceLabel(name?: string | null, id?: string | null, fallback = 'Team'): string {
  if (name && String(name).trim().length) return String(name).trim();
  if (id && String(id).trim().length) return String(id).trim();
  return fallback;
}
