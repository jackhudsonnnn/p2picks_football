import { useMemo } from 'react';
import type { TableMember, TableWithMembers } from '../types';
import { normalizeToHundredth } from '@shared/utils/number';

export function useTableMembers(table?: TableWithMembers | null, userId?: string) {
  const members: TableMember[] = useMemo(() => {
    if (!table?.table_members?.length) return [];

    return table.table_members.map((tm) => {
      const rawBustBalance = tm.bust_balance ?? 0;
      const rawPushBalance = tm.push_balance ?? 0;
      const rawSweepBalance = tm.sweep_balance ?? 0;

      const numericBustBalance = typeof rawBustBalance === 'string' ? Number(rawBustBalance) : rawBustBalance;
      const numericPushBalance = typeof rawPushBalance === 'string' ? Number(rawPushBalance) : rawPushBalance;
      const numericSweepBalance = typeof rawSweepBalance === 'string' ? Number(rawSweepBalance) : rawSweepBalance;

      const safeBustBalance = Number.isFinite(numericBustBalance) ? numericBustBalance : 0;
      const safePushBalance = Number.isFinite(numericPushBalance) ? numericPushBalance : 0;
      const safeSweepBalance = Number.isFinite(numericSweepBalance) ? numericSweepBalance : 0;

      return {
        user_id: tm.user_id,
        username: tm.users?.username ?? tm.user_id,
        bust_balance: normalizeToHundredth(safeBustBalance),
        push_balance: normalizeToHundredth(safePushBalance),
        sweep_balance: normalizeToHundredth(safeSweepBalance),
      } satisfies TableMember;
    });
  }, [table]);

  const isHost = useMemo(
    () => Boolean(table && userId && table.host_user_id === userId),
    [table, userId]
  );

  return { members, isHost } as const;
}
