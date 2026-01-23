import { getGameStatus, getPossessionTeamId, getPossessionTeamName } from '../../../../services/leagueData';
import type { League } from '../../../../types/league';
import type { ValidateProposalInput, ValidateProposalResult } from '../../shared/types';

const league: League = 'NFL';

export async function validateChooseTheirFateProposal(
  input: ValidateProposalInput
): Promise<ValidateProposalResult> {
  const gameId = input.leagueGameId;
  if (!gameId) {
    return { valid: false, error: 'Choose Their Fate requires a league_game_id' };
  }

  const status = await getGameStatus(league, gameId);  
  if (status !== 'STATUS_IN_PROGRESS' && status !== 'STATUS_END_PERIOD') {
    return {
      valid: false,
      error: 'Choose Their Fate bets can only be proposed while the game is in progress or between drives',
      details: { game_id: gameId, status: status },
    };
  }

  const [possessionTeamId, possessionTeamName] = await Promise.all([
    getPossessionTeamId(league, gameId),
    getPossessionTeamName(league, gameId),
  ]);

  if (!possessionTeamId && !possessionTeamName) {
    return {
      valid: false,
      error: 'Choose Their Fate bets require an offense with possession',
      details: { game_id: gameId, status: status },
    };
  }

  const configUpdates: Record<string, unknown> = {};
  if (!input.config.possession_team_id) {
    configUpdates.possession_team_id = possessionTeamId;
  }
  if (!input.config.possession_team_name && possessionTeamName) {
    configUpdates.possession_team_name = possessionTeamName;
  }

  return { valid: true, configUpdates };
}
