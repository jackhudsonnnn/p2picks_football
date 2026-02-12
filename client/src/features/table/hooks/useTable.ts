import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { fetchCurrentTable } from '../services/tableService';
import type { TableWithMembers } from '../types';
import { tableKeys } from '@shared/queryKeys';

export function useTable(tableId?: string) {
  const queryClient = useQueryClient();

  const { data: table = null, isLoading: loading, error: queryError } = useQuery<TableWithMembers | null>({
    queryKey: tableKeys.detail(tableId ?? ''),
    queryFn: () => fetchCurrentTable(tableId!),
    enabled: Boolean(tableId),
  });

  const error = queryError ? (queryError instanceof Error ? queryError.message : 'Could not load table. Please try again.') : null;

  const refresh = useCallback(async (_options: { silent?: boolean } = {}) => {
    if (!tableId) return;
    await queryClient.invalidateQueries({ queryKey: tableKeys.detail(tableId) });
  }, [tableId, queryClient]);

  return { table, loading, error, refresh } as const;
}
