import { useEffect, useState } from 'react';
import { fetchBetLiveInfo, type BetLiveInfo } from '../service';

export type UseBetLiveInfoArgs = {
  betId?: string | null;
  enabled?: boolean;
};

export type UseBetLiveInfoState = {
  liveInfo: BetLiveInfo | null;
  loading: boolean;
  error: string | null;
};

export function useBetLiveInfo({ betId, enabled = true }: UseBetLiveInfoArgs): UseBetLiveInfoState {
  const [liveInfo, setLiveInfo] = useState<BetLiveInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!betId) {
      setError('Unable to locate this bet');
      setLiveInfo(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchBetLiveInfo(betId)
      .then((data) => {
        if (!cancelled) {
          setLiveInfo(data);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setLiveInfo(null);
          setError(err.message || 'Failed to load live info');
          setLoading(false);
          console.warn('[useBetLiveInfo] failed', err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [betId, enabled]);

  return { liveInfo, loading, error };
}
