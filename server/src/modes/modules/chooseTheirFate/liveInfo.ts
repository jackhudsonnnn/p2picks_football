import type { GetLiveInfoInput, ModeLiveInfo } from '../../shared/types';
import { ensureRefinedGameDoc } from '../../shared/gameDocProvider';
import { RedisJsonStore } from '../../shared/redisJsonStore';
import { getRedisClient } from '../../shared/redisClient';
import { formatMatchup } from '../../shared/teamUtils';
import {
  type ChooseFateBaseline,
  type ChooseTheirFateConfig,
  collectTeamScores,
  possessionTeamIdFromDoc,
} from './evaluator';

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
  const doc = gameId ? await ensureRefinedGameDoc(gameId) : null;

  // Get possession team from baseline or current doc
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

  // Get current scores if we have a doc
  let currentScores: { home: number; away: number } | null = null;
  let currentPossession: string | null = null;

  if (doc) {
    const scores = collectTeamScores(doc);
    const teams = Object.values(scores);
    const homeTeam = teams.find(t => t.homeAway === 'home');
    const awayTeam = teams.find(t => t.homeAway === 'away');
    
    if (homeTeam && awayTeam) {
      // Calculate approximate score from TDs, FGs, and Safeties
      const homeScore = (homeTeam.touchdowns * 7) + (homeTeam.fieldGoals * 3) + (homeTeam.safeties * 2);
      const awayScore = (awayTeam.touchdowns * 7) + (awayTeam.fieldGoals * 3) + (awayTeam.safeties * 2);
      currentScores = { home: homeScore, away: awayScore };
    }

    // Get current possession
    const possTeamId = possessionTeamIdFromDoc(doc);
    if (possTeamId) {
      const possTeam = teams.find(t => t.teamId === possTeamId || t.abbreviation === possTeamId);
      currentPossession = possTeam?.abbreviation ?? possTeamId;
    }
  }

  const matchup = formatMatchup({ doc, homeName, awayName });

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
  if (!baseline && !doc) {
    return {
      ...baseResult,
      fields: [
        { label: 'Home Team', value: homeName },
        { label: 'Away Team', value: awayName },
      ],
    };
  }

  return {
    ...baseResult,
    fields,
  };
}
