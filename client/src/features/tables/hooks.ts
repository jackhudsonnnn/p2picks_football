// Aggregated exports for tables feature hooks.
// Prefer importing individual hooks (tree-shaking friendly), but this maintains a convenient barrel.

export { useTablesList } from './hooks/useTablesList';
export { useTable } from './hooks/useTable';
export { useTableMembers } from './hooks/useTableMembers';
export type { TableListItem, TableMember, Table } from './types';

// Legacy convenience wrapper combining table + members + host flag
import { useTable } from './hooks/useTable';
import { useTableMembers } from './hooks/useTableMembers';

export function useTableView(tableId?: string, userId?: string) {
	const { table, loading, error, refresh } = useTable(tableId);
	const { members, isHost } = useTableMembers(tableId, userId);
	return { table, loading, error, members, isHost, refresh } as const;
}
