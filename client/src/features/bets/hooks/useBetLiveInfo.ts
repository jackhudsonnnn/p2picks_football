import { useQuery } from '@tanstack/react-query';
import { fetchBetLiveInfo } from '../service';
import type { BetLiveInfo } from '@data/repositories/betsRepository';
import { betKeys } from '@shared/queryKeys';

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
  const { data: liveInfo = null, isLoading: loading, error: queryError } = useQuery<BetLiveInfo>({
    queryKey: betKeys.liveInfo(betId ?? ''),
    queryFn: () => fetchBetLiveInfo(betId!),
    enabled: enabled && Boolean(betId),
  });

  const error = !enabled
    ? null
    : !betId
      ? 'Unable to locate this bet'
      : queryError
        ? (queryError instanceof Error ? queryError.message : 'Failed to load live info')
        : null;

  return { liveInfo, loading, error };
}
