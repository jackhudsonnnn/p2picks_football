import type { RefinedGameDoc, Team } from '../../utils/refinedDocAccessors';
import { normalizeNumber } from '../../utils/number';

export function listTeams(doc: RefinedGameDoc | null | undefined): Team[] {
  if (!doc || !Array.isArray(doc.teams)) return [];
  return doc.teams as Team[];
}

export function normalizeTeamId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str ? str : null;
}

export function lookupTeamByIdOrName(doc: RefinedGameDoc, id?: string | null, name?: string | null): Team | null {
  const teams = listTeams(doc);
  const normalizedId = normalizeTeamId(id);
  if (normalizedId) {
    const byId = teams.find((team) => normalizeTeamId((team as any)?.teamId) === normalizedId);
    if (byId) return byId;
    const byAbbr = teams.find((team) => normalizeTeamId((team as any)?.abbreviation) === normalizedId);
    if (byAbbr) return byAbbr;
  }
  const normalizedName = name ? name.trim().toLowerCase() : '';
  if (normalizedName) {
    const byName = teams.find((team) => String((team as any)?.name ?? '').trim().toLowerCase() === normalizedName);
    if (byName) return byName;
  }
  return null;
}

export function computeTotalPoints(doc: RefinedGameDoc): number {
  const teams = listTeams(doc);
  return teams.reduce((sum, team) => sum + normalizeNumber((team as any)?.score), 0);
}

export function choiceLabel(name?: string | null, id?: string | null, fallback = 'Team'): string {
  if (name && String(name).trim().length) return String(name).trim();
  if (id && String(id).trim().length) return String(id).trim();
  return fallback;
}
