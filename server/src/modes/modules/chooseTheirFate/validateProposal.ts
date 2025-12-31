import { getGameStatus } from '../../../services/nflData/nflRefinedDataService';
import { getGameDoc } from '../../../services/nflData/nflRefinedDataService';
import { possessionTeamIdFromDoc } from './evaluator';

export async function validateChooseTheirFateProposal({
  nflGameId,
  config,
}: {
  nflGameId: string;
  config: Record<string, unknown>;
}): Promise<{ valid: boolean; error?: string; details?: any; configUpdates?: Record<string, unknown> }> {
  const gameIdForCheck = nflGameId.trim();
  if (!gameIdForCheck) {
    return { valid: false, error: 'Choose Their Fate requires an nfl_game_id' };
  }

  const rawStatus = await getGameStatus(gameIdForCheck);
  const status = (rawStatus || '').trim().toUpperCase();
  const allowedStatuses = new Set(['STATUS_IN_PROGRESS', 'STATUS_END_PERIOD']);
  
  if (!allowedStatuses.has(status)) {
    return {
      valid: false,
      error: 'Choose Their Fate bets can only be proposed while the game is in progress or between drives',
      details: { game_id: gameIdForCheck, status: rawStatus ?? null },
    };
  }

  const doc = await getGameDoc(gameIdForCheck);
  if (!doc) {
    return {
      valid: false,
      error: 'Choose Their Fate bets require live game data',
      details: { game_id: gameIdForCheck },
    };
  }

  const possessionTeamId = possessionTeamIdFromDoc(doc);
  if (!possessionTeamId) {
    return {
      valid: false,
      error: 'Choose Their Fate bets require an offense with possession',
      details: { game_id: gameIdForCheck, status: rawStatus ?? null },
    };
  }

  const configUpdates: Record<string, unknown> = {};
  if (!config.possession_team_id) {
    configUpdates.possession_team_id = possessionTeamId;
  }

  return { valid: true, configUpdates };
}
