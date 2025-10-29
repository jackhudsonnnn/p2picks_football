import { useMemo } from 'react';
import type { TableMember, TableWithMembers } from '../types';
import { normalizeToHundredth } from '@shared/utils/number';

export function useTableMembers(table?: TableWithMembers | null, userId?: string) {
  const members: TableMember[] = useMemo(() => {
    if (!table?.table_members?.length) return [];

    return table.table_members.map((tm) => {
      const rawBalance = tm.balance ?? 0;
      const numericBalance = typeof rawBalance === 'string' ? Number(rawBalance) : rawBalance;
      const safeBalance = Number.isFinite(numericBalance) ? numericBalance : 0;
      return {
        user_id: tm.user_id,
        username: tm.users?.username ?? tm.user_id,
        balance: normalizeToHundredth(safeBalance),
      } satisfies TableMember;
    });
  }, [table]);

  const isHost = useMemo(
    () => Boolean(table && userId && table.host_user_id === userId),
    [table, userId]
  );

  return { members, isHost } as const;
}
