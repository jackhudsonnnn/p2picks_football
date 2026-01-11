import { getGameStatus, getPossessionTeamId } from '../../../services/nflData/nflRefinedDataAccessors';

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

  const rawStatus = await getGameStatus(gameId);
  const status = (rawStatus || '').trim().toUpperCase();
  const allowedStatuses = new Set(['STATUS_IN_PROGRESS', 'STATUS_END_PERIOD']);
  
  if (!allowedStatuses.has(status)) {
    return {
      valid: false,
      error: 'Choose Their Fate bets can only be proposed while the game is in progress or between drives',
      details: { game_id: gameId, status: rawStatus ?? null },
    };
  }

  const possessionTeamId = await getPossessionTeamId(gameId);
  if (!possessionTeamId) {
    return {
      valid: false,
      error: 'Choose Their Fate bets require an offense with possession',
      details: { game_id: gameId, status: rawStatus ?? null },
    };
  }

  const configUpdates: Record<string, unknown> = {};
  if (!config.possession_team_id) {
    configUpdates.possession_team_id = possessionTeamId;
  }

  return { valid: true, configUpdates };
}
