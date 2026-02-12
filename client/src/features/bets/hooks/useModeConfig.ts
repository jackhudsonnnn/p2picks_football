import { useCallback, type Dispatch } from 'react';
import {
  applyBetConfigChoice,
  createBetConfigSession,
} from '../service';
import type { BetSessionAction, BetSessionState } from './betSessionTypes';
import { extractErrorMessage } from './betSessionTypes';

/**
 * Handles server config-session creation and choice application.
 */
export function useModeConfig(
  state: BetSessionState,
  dispatch: Dispatch<BetSessionAction>,
) {
  const { gameId, league, modeKey, session, sessionUpdating } = state;

  const initializeSession = useCallback(async () => {
    if (!gameId || !modeKey) return;
    dispatch({ type: 'SESSION_START' });
    try {
      const dto = await createBetConfigSession(modeKey, gameId, league);
      dispatch({ type: 'SESSION_CREATED', session: dto });
    } catch (err: unknown) {
      dispatch({
        type: 'SESSION_ERROR',
        error: extractErrorMessage(err, 'Unable to start configuration'),
      });
    }
  }, [gameId, league, modeKey, dispatch]);

  const handleChoiceChange = useCallback(
    async (stepKey: string, choiceId: string) => {
      if (!session || !choiceId || sessionUpdating) return;
      const current = session.steps.find((step) => step.key === stepKey);
      if (current?.selectedChoiceId === choiceId) return;
      dispatch({ type: 'SESSION_UPDATE_START' });
      try {
        const dto = await applyBetConfigChoice(session.session_id, stepKey, choiceId);
        dispatch({ type: 'SESSION_UPDATED', session: dto });
      } catch (err: unknown) {
        dispatch({
          type: 'SESSION_UPDATE_ERROR',
          error: extractErrorMessage(err, 'Unable to update selection'),
        });
      }
    },
    [session, sessionUpdating, dispatch],
  );

  return { initializeSession, handleChoiceChange } as const;
}
