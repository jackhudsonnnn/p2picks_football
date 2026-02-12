import { useCallback, type Dispatch } from 'react';
import { updateBetGeneralConfig } from '../service';
import type { BetSessionAction, BetSessionState } from './betSessionTypes';
import { extractErrorMessage } from './betSessionTypes';

/**
 * Handles saving the general config (wager + time limit) to the server session.
 */
export function useGeneralConfig(
  state: BetSessionState,
  dispatch: Dispatch<BetSessionAction>,
) {
  const { session, generalValues } = state;

  const handleGeneralSubmit = useCallback(async () => {
    if (!session) return;
    dispatch({ type: 'GENERAL_SAVE_START' });
    try {
      const dto = await updateBetGeneralConfig(session.session_id, {
        wager_amount: Number(generalValues.wager_amount),
        time_limit_seconds: Number(generalValues.time_limit_seconds),
      });
      dispatch({ type: 'GENERAL_SAVE_SUCCESS', session: dto });
    } catch (err: unknown) {
      dispatch({
        type: 'GENERAL_SAVE_ERROR',
        error: extractErrorMessage(err, 'Unable to update wager or time limit'),
      });
    }
  }, [session, generalValues, dispatch]);

  return { handleGeneralSubmit } as const;
}
