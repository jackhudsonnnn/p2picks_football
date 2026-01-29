import type { GetLiveInfoInput, ModeLiveInfo } from '../../../sharedUtils/types';
import { RedisJsonStore } from '../../../sharedUtils/redisJsonStore';
import { getRedisClient } from '../../../../utils/redisClient';
import {
  extractTeamAbbreviation,
  extractTeamId,
  extractTeamName,
  getAwayTeam,
  getHomeTeam,
  getPossessionTeamId,
  getPossessionTeamName,
  getMatchup,
} from '../../../../services/leagueData';
import type { League } from '../../../../types/league';
import { type ChooseFateBaseline, type ChooseTheirFateConfig } from './evaluator';

const league: League = 'NFL';

// Shared baseline store - must use same prefix as validator
const redis = getRedisClient();
const baselineStore = new RedisJsonStore<ChooseFateBaseline>(redis, 'choosefate:baseline', 60 * 60 * 6);

export async function getChooseTheirFateLiveInfo(input: GetLiveInfoInput): Promise<ModeLiveInfo> {
  const { betId, config, leagueGameId } = input;
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
  const gameId = leagueGameId ?? typedConfig.league_game_id ?? baseline?.gameId ?? null;

  const [homeTeam, awayTeam, livePossessionTeamId, livePossessionTeamName] = gameId
    ? await Promise.all([
        getHomeTeam(league, gameId),
        getAwayTeam(league, gameId),
        getPossessionTeamId(league, gameId),
        getPossessionTeamName(league, gameId),
      ])
    : [null, null, null, null];

  let possessionTeam =
    livePossessionTeamName ??
    typedConfig.possession_team_name ??
    typedConfig.possession_team_id ??
    null;
  
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
  const matchupLabel = await getMatchup(league, gameId || '');
  const fields: { label: string; value: string | number }[] = [];

  fields.push({ label: 'Matchup', value: matchupLabel });

  // Show drive/possession info
  if (possessionTeam) {
    fields.push({ label: 'Drive Team', value: possessionTeam });
  }

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
      if (abbr && abbr === normalized) {
        return extractTeamAbbreviation(team as any) ?? possTeamId;
      }
      if (teamId && teamId === normalized) {
        return extractTeamAbbreviation(team as any) ?? extractTeamId(team as any) ?? possTeamId;
      }
    }
  }
  return possTeamId;
}
