import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchModeOverviews } from '@shared/api/modeCatalog';
import type { ModeOverview } from '../types';

type UseModeCatalogOptions = {
  enabled?: boolean;
};

type UseModeCatalogResult = {
  overviews: ModeOverview[];
  loading: boolean;
  error: string | null;
  hasLoaded: boolean;
  refresh: () => Promise<void>;
};

const DEFAULT_ERROR = 'Failed to load bet mode overviews.';

export function useModeCatalog(options: UseModeCatalogOptions = {}): UseModeCatalogResult {
  const { enabled = true } = options;
  const [overviews, setOverviews] = useState<ModeOverview[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    async (force = false) => {
      if (!enabled) return;
      setLoading(true);
      try {
        const data = await fetchModeOverviews(force);
        if (!mountedRef.current) return;
        setOverviews(data);
        setError(null);
      } catch (err) {
        if (!mountedRef.current) return;
        const message = err instanceof Error && err.message ? err.message : DEFAULT_ERROR;
        setError(message);
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return;
    if (overviews !== null) return;

    let ignore = false;
    setLoading(true);

    fetchModeOverviews()
      .then((data) => {
        if (ignore || !mountedRef.current) return;
        setOverviews(data);
        setError(null);
      })
      .catch((err) => {
        if (ignore || !mountedRef.current) return;
        const message = err instanceof Error && err.message ? err.message : DEFAULT_ERROR;
        setError(message);
      })
      .finally(() => {
        if (ignore || !mountedRef.current) return;
        setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [enabled, overviews]);

  const refresh = useCallback(async () => {
    await load(true);
  }, [load]);

  return {
    overviews: overviews ?? [],
    loading,
    error,
    hasLoaded: overviews !== null,
    refresh,
  };
}