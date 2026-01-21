import { useEffect, useMemo, useState } from 'react';
import { fetchModePreview, type ModePreviewPayload } from '../service';

export type UseModePreviewArgs = {
  modeKey?: string | null;
  modeConfig?: Record<string, unknown> | null;
  leagueGameId?: string | null;
  league?: 'U2Pick' | 'NFL' | 'NBA' | 'MLB' | 'NHL' | 'NCAAF';
  betId?: string | null;
};

export type UseModePreviewState = {
  preview: ModePreviewPayload | null;
  error: string | null;
  loading: boolean;
};

export function useModePreview({ modeKey, modeConfig, leagueGameId, league = 'U2Pick', betId }: UseModePreviewArgs): UseModePreviewState {
  const [preview, setPreview] = useState<ModePreviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const configSignature = useMemo(() => JSON.stringify(modeConfig || {}), [modeConfig]);

  useEffect(() => {
    if (!modeKey) {
      setPreview(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchModePreview(modeKey, modeConfig || {}, leagueGameId ?? null, betId ?? null, league)
      .then((data) => {
        if (!cancelled) {
          setPreview(data);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setPreview(null);
          setError(err.message);
          setLoading(false);
          console.warn('[useModePreview] failed to load mode preview', err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [modeKey, configSignature, leagueGameId, league, betId]);

  return { preview, error, loading };
}
