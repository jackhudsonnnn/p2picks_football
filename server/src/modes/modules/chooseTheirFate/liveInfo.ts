import type { GetLiveInfoInput, ModeLiveInfo } from '../../shared/types';
import { RedisJsonStore } from '../../shared/redisJsonStore';
import { getRedisClient } from '../../shared/redisClient';
import { formatMatchup } from '../../shared/teamUtils';
import {
  extractTeamAbbreviation,
  extractTeamId,
  extractTeamName,
  getAwayTeam,
  getHomeTeam,
  getPossessionTeamId,
} from '../../../services/nflData/nflRefinedDataAccessors';
import { type ChooseFateBaseline, type ChooseTheirFateConfig } from './evaluator';

// Shared baseline store - must use same prefix as validator
const redis = getRedisClient();
const baselineStore = new RedisJsonStore<ChooseFateBaseline>(redis, 'choosefate:baseline', 60 * 60 * 6);

export async function getChooseTheirFateLiveInfo(input: GetLiveInfoInput): Promise<ModeLiveInfo> {
  const { betId, config, nflGameId } = input;
  const typedConfig = config as ChooseTheirFateConfig;

  const baseResult: ModeLiveInfo = {
    modeKey: 'choose_their_fate',
    modeLabel: 'Choose Their Fate',
    fields: [],
  };

  // Get team names
  const homeName = typedConfig.home_team_name ?? typedConfig.home_team_id ?? 'Home';
  const awayName = typedConfig.away_team_name ?? typedConfig.away_team_id ?? 'Away';

  // Try to get baseline from Redis
  const baseline = await baselineStore.get(betId);

  // Get live game data
  const gameId = nflGameId ?? typedConfig.nfl_game_id ?? baseline?.gameId ?? null;

  const [homeTeam, awayTeam, livePossessionTeamId] = gameId
    ? await Promise.all([
        getHomeTeam(gameId),
        getAwayTeam(gameId),
        getPossessionTeamId(gameId),
      ])
    : [null, null, null];

  let possessionTeam = typedConfig.possession_team_name ?? typedConfig.possession_team_id ?? null;
  
  if (baseline?.possessionTeamId) {
    // Try to resolve the possession team name from baseline
    const baselineTeams = Object.values(baseline.teams);
    const possTeam = baselineTeams.find(t => 
      t.teamId === baseline.possessionTeamId || 
      t.abbreviation === baseline.possessionTeamId
    );
    if (possTeam) {
      possessionTeam = possTeam.abbreviation ?? possTeam.teamId ?? baseline.possessionTeamId;
    } else {
      possessionTeam = baseline.possessionTeamId;
    }
  }

  if (!possessionTeam && livePossessionTeamId) {
    possessionTeam = resolvePossessionLabel(livePossessionTeamId, homeTeam, awayTeam);
  }

  const resolvedHomeName = resolveTeamLabel(homeTeam, homeName);
  const resolvedAwayName = resolveTeamLabel(awayTeam, awayName);

  const matchup = formatMatchup({ homeName: resolvedHomeName, awayName: resolvedAwayName });

  const fields: { label: string; value: string | number }[] = [];

  if (matchup) {
    fields.push({ label: 'Matchup', value: matchup });
  }

  // Show drive/possession info
  if (possessionTeam) {
    fields.push({ label: 'Drive Team', value: possessionTeam });
  }

  // Show baseline stats for the drive team if available
  // if (baseline && possessionTeam) {
  //   const driveTeamBaseline = Object.values(baseline.teams).find(
  //     t => t.teamId === baseline.possessionTeamId || t.abbreviation === baseline.possessionTeamId
  //   );
  //   if (driveTeamBaseline) {
  //     fields.push({ label: 'TDs', value: driveTeamBaseline.touchdowns });
  //     fields.push({ label: 'FGs', value: driveTeamBaseline.fieldGoals });
  //     fields.push({ label: 'Safeties', value: driveTeamBaseline.safeties });
  //     fields.push({ label: 'Punts', value: driveTeamBaseline.punts });
  //   }
  // }

  // Add unavailable reason if no data
  if (!baseline && !homeTeam && !awayTeam && !livePossessionTeamId) {
    return {
      ...baseResult,
      fields: [
        { label: 'Home Team', value: resolvedHomeName ?? homeName },
        { label: 'Away Team', value: resolvedAwayName ?? awayName },
      ],
    };
  }

  return {
    ...baseResult,
    fields,
  };
}

function resolveTeamLabel(team: unknown, fallback: string | null): string | null {
  return (
    extractTeamAbbreviation(team as any) ??
    extractTeamId(team as any) ??
    extractTeamName(team as any) ??
    (fallback ?? null)
  );
}

function resolvePossessionLabel(possTeamId: string, homeTeam: unknown, awayTeam: unknown): string {
  const normalized = possTeamId?.toLowerCase?.();
  if (normalized) {
    const candidates = [homeTeam, awayTeam];
    for (const team of candidates) {
      const teamId = extractTeamId(team as any)?.toLowerCase?.();
      const abbr = extractTeamAbbreviation(team as any)?.toLowerCase?.();
      if (teamId && teamId === normalized) {
        return extractTeamAbbreviation(team as any) ?? extractTeamId(team as any) ?? possTeamId;
      }
      if (abbr && abbr === normalized) {
        return extractTeamAbbreviation(team as any) ?? possTeamId;
      }
    }
  }
  return possTeamId;
}
