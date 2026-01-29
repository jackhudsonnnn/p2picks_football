export { useTablesList } from './hooks/useTablesList';
export { useTable } from './hooks/useTable';
export { useTableMembers } from './hooks/useTableMembers';
export type { TableListItem, TableMember, Table, BalanceType } from './types';

import { useEffect } from 'react';
import { subscribeToTableMembers } from './services/tableService';
import { useTable } from './hooks/useTable';
import { useTableMembers } from './hooks/useTableMembers';

export function useTableView(tableId?: string, userId?: string) {
	const { table, loading, error, refresh } = useTable(tableId);
	const { members, isHost } = useTableMembers(table, userId);

	useEffect(() => {
		if (!tableId) return;
		const channel = subscribeToTableMembers(tableId, () => {
			void refresh({ silent: true });
		});
		return () => {
			channel.unsubscribe();
		};
	}, [tableId, refresh]);

	return { table, loading, error, members, isHost, refresh } as const;
}
