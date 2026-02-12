import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchModeOverviews } from '../service';
import type { ModeOverview, League } from '../types';
import { modeKeys } from '@shared/queryKeys';

type UseModeCatalogOptions = {
  /** The league to fetch modes for (required) */
  league: League;
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

export function useModeCatalog(options: UseModeCatalogOptions): UseModeCatalogResult {
  const { league, enabled = true } = options;
  const queryClient = useQueryClient();

  const { data: overviews, isLoading: loading, error: queryError, isFetched } = useQuery<ModeOverview[]>({
    queryKey: modeKeys.catalog(league),
    queryFn: () => fetchModeOverviews(league),
    enabled,
    staleTime: 60_000, // mode catalog changes rarely
  });

  const error = queryError
    ? (queryError instanceof Error && queryError.message ? queryError.message : DEFAULT_ERROR)
    : null;

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: modeKeys.catalog(league) });
  }, [queryClient, league]);

  return {
    overviews: overviews ?? [],
    loading,
    error,
    hasLoaded: isFetched,
    refresh,
  };
}