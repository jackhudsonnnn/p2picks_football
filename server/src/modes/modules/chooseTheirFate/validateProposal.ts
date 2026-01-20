import { getGameStatus, getPossessionTeamId, getPossessionTeamName } from '../../../services/nflData/nflRefinedDataAccessors';

export async function validateChooseTheirFateProposal({
  nflGameId,
  config,
}: {
  nflGameId: string;
  config: Record<string, unknown>;
}): Promise<{ valid: boolean; error?: string; details?: any; configUpdates?: Record<string, unknown> }> {
  const gameId = nflGameId;
  if (!gameId) {
    return { valid: false, error: 'Choose Their Fate requires an nfl_game_id' };
  }

  const status = await getGameStatus(gameId);  
  if (status !== 'STATUS_IN_PROGRESS' && status !== 'STATUS_END_PERIOD') {
    return {
      valid: false,
      error: 'Choose Their Fate bets can only be proposed while the game is in progress or between drives',
      details: { game_id: gameId, status: status },
    };
  }

  const [possessionTeamId, possessionTeamName] = await Promise.all([
    getPossessionTeamId(gameId),
    getPossessionTeamName(gameId),
  ]);

  if (!possessionTeamId && !possessionTeamName) {
    return {
      valid: false,
      error: 'Choose Their Fate bets require an offense with possession',
      details: { game_id: gameId, status: status },
    };
  }

  const configUpdates: Record<string, unknown> = {};
  if (!config.possession_team_id) {
    configUpdates.possession_team_id = possessionTeamId;
  }
  if (!config.possession_team_name && possessionTeamName) {
    configUpdates.possession_team_name = possessionTeamName;
  }

  return { valid: true, configUpdates };
}
