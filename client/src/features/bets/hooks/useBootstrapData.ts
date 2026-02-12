import { useEffect, type Dispatch } from 'react';
import type { League } from '@shared/types/bet';
import {
  fetchActiveLeagues,
  fetchBetProposalBootstrap,
  fetchGamesForLeague,
  type BetGeneralConfigSchema,
} from '../service';
import type {
  BetSessionAction,
  BetSessionState,
  GeneralValues,
  ModeEntry,
  U2PickValidation,
} from './betSessionTypes';
import {
  DEFAULT_GENERAL_VALUES,
  DEFAULT_U2PICK_VALIDATION,
  extractErrorMessage,
} from './betSessionTypes';

/**
 * Handles:
 * - Fetching active leagues on mount
 * - Fetching bootstrap data when league changes
 * - Fetching games when league changes (non-U2Pick)
 */
export function useBootstrapData(
  state: BetSessionState,
  dispatch: Dispatch<BetSessionAction>,
): void {
  const { league, activeLeagues } = state;

  // ── Fetch active leagues on mount ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        const leagues = await fetchActiveLeagues(controller.signal);
        if (cancelled) return;
        if (Array.isArray(leagues) && leagues.length > 0) {
          dispatch({ type: 'SET_ACTIVE_LEAGUES', leagues: leagues as League[] });
        }
      } catch {
        // Keep defaults on failure
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [dispatch]);

  // ── Bootstrap fetch (league-scoped) ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      dispatch({ type: 'BOOTSTRAP_START' });
      try {
        const [payload, leagues] = await Promise.all([
          fetchBetProposalBootstrap(league, controller.signal),
          fetchActiveLeagues(controller.signal).catch(() => [] as League[]),
        ]);
        if (cancelled) return;

        // Parse mode entries
        const modeEntries: ModeEntry[] = Array.isArray(payload?.modes)
          ? payload.modes
              .map((item) => {
                const typedItem = item as Record<string, unknown>;
                const metadata = typedItem?.metadata as Record<string, unknown> | undefined;
                const supportedLeaguesRaw = (typedItem?.supportedLeagues ?? metadata?.supportedLeagues) as unknown;
                const supportedLeagues = Array.isArray(supportedLeaguesRaw)
                  ? supportedLeaguesRaw
                      .map((value) => (typeof value === 'string' ? value.trim() : ''))
                      .filter((value): value is League => typeof value === 'string' && value.length > 0)
                  : undefined;
                const available = (typedItem?.available ?? typedItem?.enabled ?? typedItem?.isAvailable ?? metadata?.available ?? true) as boolean;
                return {
                  key: String(typedItem?.key ?? ''),
                  label: String(typedItem?.label ?? typedItem?.key ?? ''),
                  available: available !== false,
                  supportedLeagues,
                } satisfies ModeEntry;
              })
              .filter((entry) => entry.key && entry.label)
          : [];

        const generalSchema = (payload?.general_config_schema as BetGeneralConfigSchema) ?? null;
        let defaultGeneralValues: GeneralValues | undefined;
        if (generalSchema) {
          defaultGeneralValues = {
            wager_amount: String(generalSchema.wager_amount?.defaultValue ?? DEFAULT_GENERAL_VALUES.wager_amount),
            time_limit_seconds: String(generalSchema.time_limit_seconds?.defaultValue ?? DEFAULT_GENERAL_VALUES.time_limit_seconds),
          };
        }

        // U2Pick validation metadata
        let u2pickValidation: U2PickValidation | undefined;
        let games: { id: string; label: string }[] = [];
        let defaultGameId: string | undefined;
        let defaultModeKey: string | undefined;

        if (league === 'U2Pick') {
          const bootstrapRecord = payload as Record<string, unknown>;
          const validation = (bootstrapRecord?.validation ?? bootstrapRecord?.u2pick_validation ?? bootstrapRecord?.mode_validation ?? null) as Record<string, unknown> | null;
          if (validation && typeof validation === 'object') {
            u2pickValidation = {
              conditionMin: Number((validation.conditionMin ?? validation.condition_min) ?? DEFAULT_U2PICK_VALIDATION.conditionMin),
              conditionMax: Number((validation.conditionMax ?? validation.condition_max) ?? DEFAULT_U2PICK_VALIDATION.conditionMax),
              optionMin: Number((validation.optionMin ?? validation.option_min) ?? DEFAULT_U2PICK_VALIDATION.optionMin),
              optionMax: Number((validation.optionMax ?? validation.option_max) ?? DEFAULT_U2PICK_VALIDATION.optionMax),
              optionsMinCount: Number((validation.optionsMinCount ?? validation.options_min_count) ?? DEFAULT_U2PICK_VALIDATION.optionsMinCount),
              optionsMaxCount: Number((validation.optionsMaxCount ?? validation.options_max_count) ?? DEFAULT_U2PICK_VALIDATION.optionsMaxCount),
            };
          }
          const gamesList = Array.isArray(payload?.games) && payload.games.length ? payload.games : [];
          games = gamesList as { id: string; label: string }[];
          defaultGameId = String(gamesList[0]?.id ?? '');
          defaultModeKey = modeEntries[0]?.key ?? '';
        }

        dispatch({
          type: 'BOOTSTRAP_SUCCESS',
          modes: modeEntries,
          generalSchema,
          games,
          activeLeagues: leagues.length > 0 ? leagues : [],
          u2pickValidation,
          defaultGameId,
          defaultModeKey,
          defaultGeneralValues,
        });
      } catch (err: unknown) {
        if (!cancelled) {
          dispatch({
            type: 'BOOTSTRAP_ERROR',
            error: extractErrorMessage(err, 'Unable to load bet proposal setup'),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [league, dispatch]);

  // ── Fetch games for non-U2Pick leagues ─────────────────────────────
  useEffect(() => {
    if (league === 'U2Pick') return;
    if (!activeLeagues.includes(league)) return;

    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      dispatch({ type: 'SET_GAMES_LOADING', loading: true });
      try {
        const gameEntries = await fetchGamesForLeague(league, controller.signal);
        if (cancelled) return;
        dispatch({ type: 'SET_GAMES', games: gameEntries });
      } catch {
        if (!cancelled) {
          dispatch({ type: 'SET_GAMES', games: [] });
        }
      } finally {
        if (!cancelled) dispatch({ type: 'SET_GAMES_LOADING', loading: false });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [league, activeLeagues, dispatch]);
}
