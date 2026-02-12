import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchModePreview } from '../service';
import type { ModePreviewPayload } from '@shared/types/modes';
import { modeKeys } from '@shared/queryKeys';

export type UseModePreviewArgs = {
  modeKey: string;
  modeConfig?: Record<string, unknown> | null;
  leagueGameId: string;
  league: 'U2Pick' | 'NFL' | 'NBA' | 'MLB' | 'NHL' | 'NCAAF';
  betId?: string | null;
};

export type UseModePreviewState = {
  preview: ModePreviewPayload | null;
  error: string | null;
  loading: boolean;
};

export function useModePreview({ modeKey, modeConfig, leagueGameId, league = 'U2Pick', betId }: UseModePreviewArgs): UseModePreviewState {
  const configSignature = useMemo(() => JSON.stringify(modeConfig || {}), [modeConfig]);

  const { data: preview = null, isLoading: loading, error: queryError } = useQuery<ModePreviewPayload | null>({
    queryKey: modeKeys.preview(modeKey, configSignature, leagueGameId, league, betId),
    queryFn: async () => {
      const result = await fetchModePreview(modeKey, modeConfig || {}, leagueGameId ?? null, betId ?? null, league);
      return result ?? null;
    },
    enabled: Boolean(modeKey),
  });

  const error = queryError
    ? (queryError instanceof Error ? queryError.message : 'Failed to load mode preview')
    : null;

  return { preview, error, loading };
}
