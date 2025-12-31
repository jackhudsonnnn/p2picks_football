import type { RefinedGameDoc, Team } from '../../services/nflRefinedDataService';
import { normalizeNumber } from '../../utils/number';

export function listTeams(doc: RefinedGameDoc | null | undefined): Team[] {
  if (!doc || !Array.isArray(doc.teams)) return [];
  return doc.teams as Team[];
}

function pickTeamLabel(team: Team | null | undefined, fallback = 'Team'): string {
  if (!team) return fallback;
  const abbr = normalizeTeamId((team as any)?.abbreviation);
  if (abbr) return abbr.toUpperCase();
  const id = normalizeTeamId((team as any)?.teamId);
  if (id) return id.toUpperCase();
  const name = String((team as any)?.name ?? '').trim();
  if (name) return name;
  return fallback;
}

/**
 * Formats a matchup string like "BUF vs BAL", preferring team abbreviations and
 * falling back to teamId or name. Uses home/away ordering when available.
 */
export function formatMatchup(options?: {
  doc?: RefinedGameDoc | null;
  homeName?: string | null;
  awayName?: string | null;
}): string | null {
  const { doc = null, homeName = null, awayName = null } = options || {};
  const teams = listTeams(doc);
  const homeTeam = teams.find((t) => (t as any)?.homeAway === 'home') ?? teams[0];
  const awayTeam = teams.find((t) => (t as any)?.homeAway === 'away') ?? teams[1];

  const homeLabel = homeTeam ? pickTeamLabel(homeTeam) : (homeName ?? null);
  const awayLabel = awayTeam ? pickTeamLabel(awayTeam) : (awayName ?? null);

  if (homeLabel && awayLabel) {
    return `${homeLabel} vs ${awayLabel}`;
  }
  return null;
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
