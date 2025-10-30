import { supabase } from '@data/clients/supabaseClient';
import type { Tables } from '@data/types/database.types';
import type { ChatMessage } from '@shared/types/chat';
import { normalizeToHundredth } from '@shared/utils/number';
import { fetchModeConfigs, fetchModePreview } from '@data/repositories/modesRepository';

export type TableRow = Tables<'tables'>;
type TableMemberRow = Tables<'table_members'>;
type UserRow = Tables<'users'>;

export interface TableMemberWithUser {
  user_id: TableMemberRow['user_id'];
  balance: TableMemberRow['balance'] | null;
  users?: {
    username?: UserRow['username'] | null;
  } | null;
}

export type TableWithMembers = TableRow & {
  table_members: TableMemberWithUser[];
};

type RawMember = Partial<TableMemberRow> & {
  users?: {
    username?: UserRow['username'] | null;
  } | null;
};

type MembershipRow = {
  tables: (TableRow & { table_members: RawMember[] | null }) | null;
};

function normalizeMembers(members: RawMember[] | null | undefined): TableMemberWithUser[] {
  if (!Array.isArray(members)) {
    return [];
  }
  return members
    .filter((member): member is RawMember & { user_id: string } => typeof member?.user_id === 'string')
    .map((member) => ({
      user_id: member.user_id,
      balance: typeof member.balance === 'number' ? member.balance : null,
      users: member.users ? { username: member.users.username ?? null } : null,
    }));
}

export async function createTable(tableName: string, hostUserId: string): Promise<TableRow> {
  const { data: table, error } = await supabase
    .from('tables')
    .insert([{ table_name: tableName, host_user_id: hostUserId }])
    .select()
    .single();
  if (error) throw error;
  if (!table) {
    throw new Error('Failed to create table');
  }
  await supabase.from('table_members').insert([
    { table_id: table.table_id, user_id: hostUserId },
  ]);
  return table as TableRow;
}

export async function getUserTables(userId: string): Promise<TableWithMembers[]> {
  const { data, error } = await supabase
    .from('table_members')
    .select('tables(*, table_members(*, users(username)))')
    .eq('user_id', userId);
  if (error) throw error;
  const rows = (data ?? []) as MembershipRow[];
  return rows
    .map((row) => row.tables)
    .filter((table): table is TableRow & { table_members: RawMember[] | null } => Boolean(table))
    .map((table) => ({
      ...table,
      table_members: normalizeMembers(table.table_members),
    }));
}

export async function getTable(tableId: string): Promise<TableWithMembers | null> {
  const { data: table, error } = await supabase
    .from('tables')
    .select('table_id, table_name, host_user_id, created_at, last_activity_at, table_members(user_id, balance, users(username))')
    .eq('table_id', tableId)
    .single();
  if (error) throw error;
  if (!table) return null;
  const withMembers = table as TableRow & { table_members: RawMember[] | null };
  return {
    ...withMembers,
    table_members: normalizeMembers(withMembers.table_members),
  };
}

export async function addTableMember(tableId: string, userId: string) {
  const { error } = await supabase
    .from('table_members')
    .insert([{ table_id: tableId, user_id: userId }]);
  if (error) throw error;
}

export async function removeTableMember(tableId: string, userId: string) {
  const { error } = await supabase
    .from('table_members')
    .delete()
    .eq('table_id', tableId)
    .eq('user_id', userId);
  if (error) throw error;
}

interface SettlementMemberRecord {
  user_id: string;
  username: string;
  balance: number;
}

export interface TableSettlementResult {
  summary: string;
  messageId: string;
  generatedAt: string;
}

export interface TableFeedCursor {
  postedAt: string;
  messageId: string;
}

export interface TableFeedOptions {
  limit?: number;
  before?: TableFeedCursor | null;
}

export interface TableFeedPage {
  messages: ChatMessage[];
  nextCursor: TableFeedCursor | null;
  hasMore: boolean;
}

function formatPointsDisplay(value: number): string {
  const normalized = normalizeToHundredth(value);
  if (normalized === 0) {
    return '0 points';
  }
  const abs = Math.abs(normalized);
  const formatted = Number.isInteger(abs) ? abs.toFixed(0) : abs.toFixed(2);
  const sign = normalized > 0 ? '+' : '-';
  return `${sign}${formatted} points`;
}

function buildSettlementSummary(
  tableName: string | null,
  host: SettlementMemberRecord,
  others: SettlementMemberRecord[],
): string {
  const winners = others
    .filter((member) => member.balance > 0)
    .sort((a, b) => b.balance - a.balance);
  const losers = others
    .filter((member) => member.balance < 0)
    .sort((a, b) => a.balance - b.balance);

  const lines: string[] = [];
  lines.push(`${tableName ?? 'Table'} Settlement Summary`);
  lines.push(`${new Date().toLocaleString()}`);
  lines.push('');

  lines.push('Host:');
  lines.push(`- ${host.username}: ${formatPointsDisplay(host.balance)}`);
  lines.push('');

  lines.push('Winners (To Receive from Host):');
  if (winners.length) {
    winners.forEach((member) => {
      lines.push(`- ${member.username}: ${formatPointsDisplay(member.balance)}`);
    });
  } else {
    lines.push('- None');
  }
  lines.push('');

  lines.push('Losers (To Pay Host):');
  if (losers.length) {
    losers.forEach((member) => {
      lines.push(`- ${member.username}: ${formatPointsDisplay(member.balance)}`);
    });
  } else {
    lines.push('- None');
  }

  return lines.join('\n');
}

export async function settleTable(tableId: string): Promise<TableSettlementResult> {
  if (!tableId) {
    throw new Error('tableId is required to settle a table');
  }

  const { data: tableRecord, error: tableError } = await supabase
    .from('tables')
    .select('table_id, table_name, host_user_id, table_members(user_id, balance, users(username))')
    .eq('table_id', tableId)
    .single();

  if (tableError) throw tableError;
  if (!tableRecord) throw new Error('Table not found');

  const normalized = normalizeMembers((tableRecord as TableRow & { table_members: RawMember[] | null }).table_members);

  const members: SettlementMemberRecord[] = normalized.map((member) => ({
    user_id: member.user_id,
    username: member.users?.username ?? member.user_id,
    balance: normalizeToHundredth(member.balance ?? 0),
  }));

  if (!members.length) {
    throw new Error('Cannot settle a table with no members');
  }

  const hostMember = members.find((member) => member.user_id === tableRecord.host_user_id);
  if (!hostMember) {
    throw new Error('Host record missing from table members');
  }

  const nonHostMembers = members.filter((member) => member.user_id !== hostMember.user_id);
  const summary = buildSettlementSummary(tableRecord.table_name ?? null, hostMember, nonHostMembers);

  const originalBalances = members.map((member) => ({
    user_id: member.user_id,
    balance: member.balance,
  }));

  console.log('[settleTable] originalBalances:', originalBalances);

  const { data: balanceData, error: balanceError } = await supabase
    .from('table_members')
    .update({ balance: 0 })
    .eq('table_id', tableId);

  console.log('[settleTable] update table_members result:', { data: balanceData, error: balanceError });

  if (balanceError) throw balanceError;

  const { data: updatedMembers, error: fetchUpdatedError } = await supabase
    .from('table_members')
    .select('user_id, balance')
    .eq('table_id', tableId);

  console.debug('[settleTable] verify updated table_members:', { data: updatedMembers, error: fetchUpdatedError });

  if (fetchUpdatedError) throw fetchUpdatedError;

  const { data: messageData, error: messageError } = await supabase
    .from('system_messages')
    .insert([{ table_id: tableId, message_text: summary }])
    .select('system_message_id, generated_at')
    .single();

  console.debug('[settleTable] insert system_messages result:', { data: messageData, error: messageError });

  if (messageError) {
    console.error('[settleTable] Failed to insert system message, rolling back balances');
    await Promise.all(
      originalBalances.map(async ({ user_id, balance }) => {
        const { error: rollbackError } = await supabase
          .from('table_members')
          .update({ balance })
          .eq('table_id', tableId)
          .eq('user_id', user_id);
        if (rollbackError) {
          console.error('[settleTable] Failed to rollback balance for user', user_id, rollbackError);
        }
      }),
    );
    throw messageError;
  }

  return {
    summary,
    messageId: messageData?.system_message_id ?? '',
    generatedAt: messageData?.generated_at ?? new Date().toISOString(),
  };
}

export async function getTableFeed(tableId: string, options: TableFeedOptions = {}): Promise<TableFeedPage> {
  const { limit = 10, before } = options;
  const effectiveLimit = Math.max(1, Math.min(limit, 100));

  let query = supabase
    .from('messages')
    .select(`
      message_id,
      table_id,
      message_type,
      posted_at,
      text_messages (
        text_message_id,
        table_id,
        user_id,
        message_text,
        posted_at,
        users:user_id (username)
      ),
      system_messages (
        system_message_id,
        table_id,
        message_text,
        generated_at
      ),
      bet_proposals (
        bet_id,
        table_id,
        proposer_user_id,
        nfl_game_id,
        mode_key,
        description,
        wager_amount,
        time_limit_seconds,
        proposal_time,
        bet_status,
        close_time,
        winning_choice,
        resolution_time,
        users:proposer_user_id (username)
      )
    `)
    .eq('table_id', tableId)
    .order('posted_at', { ascending: false })
    .order('message_id', { ascending: false })
    .limit(effectiveLimit + 1);

  if (before) {
    const postedAtIso = new Date(before.postedAt).toISOString();
    query = query.or(
      `and(posted_at.lt.${postedAtIso}),and(posted_at.eq.${postedAtIso},message_id.lt.${before.messageId})`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  let rows = (data ?? []) as any[];
  const hasMore = rows.length > effectiveLimit;
  if (hasMore) {
    rows = rows.slice(0, effectiveLimit);
  }

  const normalizeTimestamp = (value: string | null | undefined) => {
    if (!value) return new Date().toISOString();
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString();
    }
    return parsed.toISOString();
  };

  const normalizedRows = rows.map((row) => ({
    ...row,
    posted_at: row.posted_at ?? row?.text_messages?.posted_at ?? row?.system_messages?.generated_at ?? null,
  }));

  const nextCursor = normalizedRows.length
    ? {
        postedAt: normalizeTimestamp(normalizedRows[normalizedRows.length - 1].posted_at),
        messageId: normalizedRows[normalizedRows.length - 1].message_id as string,
      }
    : null;

  const betRows = normalizedRows
    .filter((row) => row.message_type === 'bet_proposal' && row.bet_proposals)
    .map((row) => row.bet_proposals);

  const betIds = Array.from(new Set(betRows.map((bet: any) => bet?.bet_id).filter(Boolean))) as string[];
  if (betIds.length) {
    try {
      const configs = await fetchModeConfigs(betIds);
      betRows.forEach((bet: any) => {
        const record = configs[bet.bet_id];
        if (record && (!bet.mode_key || record.mode_key === bet.mode_key)) {
          (bet as any).mode_config = record.data;
        }
      });
    } catch (cfgErr) {
      console.warn('[getTableFeed] failed to hydrate mode config', cfgErr);
    }
  }

  const winningConditionByBetId = new Map<string, string>();
  const previewResults = await Promise.all(
    betRows.map(async (bet: any) => {
      const modeKey = typeof bet.mode_key === 'string' ? bet.mode_key.trim() : '';
      const betId = typeof bet.bet_id === 'string' ? bet.bet_id : '';
      if (!modeKey || !betId) return null;

      const rawConfig = (bet as any).mode_config;
      const config = rawConfig && typeof rawConfig === 'object' ? (rawConfig as Record<string, unknown>) : {};
      try {
        const preview = await fetchModePreview(
          modeKey,
          config,
          typeof bet.nfl_game_id === 'string' ? bet.nfl_game_id : null,
          betId,
        );
        const winningCondition = preview?.winningCondition?.trim();
        if (winningCondition) {
          return { betId, winningCondition };
        }
      } catch (previewErr) {
        console.warn('[getTableFeed] failed to load mode preview', {
          betId,
          error: (previewErr as Error)?.message ?? previewErr,
        });
      }
      return null;
    }),
  );

  previewResults.forEach((entry) => {
    if (entry) {
      winningConditionByBetId.set(entry.betId, entry.winningCondition);
    }
  });

  const messages: ChatMessage[] = [];

  normalizedRows
    .slice()
    .reverse()
    .forEach((row) => {
      const timestampIso = normalizeTimestamp(row.posted_at);
      if (row.message_type === 'chat') {
        const txt = row.text_messages;
        if (!txt) return;
        const username = txt?.users?.username ?? 'Unknown';
        messages.push({
          id: row.message_id as string,
          type: 'chat',
          senderUserId: txt.user_id ?? '',
          senderUsername: username,
          text: txt.message_text ?? '',
          timestamp: timestampIso,
          tableId: txt.table_id ?? row.table_id,
        });
        return;
      }

      if (row.message_type === 'system') {
        const sys = row.system_messages;
        if (!sys) return;
        messages.push({
          id: row.message_id as string,
          type: 'system',
          senderUserId: '',
          senderUsername: '',
          text: sys.message_text ?? '',
          timestamp: timestampIso,
          tableId: sys.table_id ?? row.table_id,
        });
        return;
      }

      if (row.message_type === 'bet_proposal') {
        const bet = row.bet_proposals;
        if (!bet) return;

        const username = bet?.users?.username ?? 'Unknown';
        const description = typeof bet.description === 'string' && bet.description.length ? bet.description : 'Bet';
        const winningCondition = typeof bet.bet_id === 'string' ? winningConditionByBetId.get(bet.bet_id) ?? null : null;

        messages.push({
          id: row.message_id as string,
          type: 'bet_proposal',
          senderUserId: bet.proposer_user_id ?? '',
          senderUsername: username,
          text: '',
          timestamp: timestampIso,
          tableId: bet.table_id ?? row.table_id,
          betProposalId: bet.bet_id,
          betDetails: {
            description,
            wager_amount: bet.wager_amount,
            time_limit_seconds: bet.time_limit_seconds,
            bet_status: bet.bet_status,
            close_time: bet.close_time,
            winning_choice: bet.winning_choice,
            resolution_time: bet.resolution_time,
            mode_key: bet.mode_key,
            nfl_game_id: bet.nfl_game_id,
            winning_condition_text: winningCondition,
          },
        });
      }
    });

  return {
    messages,
    nextCursor,
    hasMore,
  };
}

export async function sendTextMessage(tableId: string, userId: string, messageText: string) {
  const { data: txtMsg, error: msgError } = await supabase
    .from('text_messages')
    .insert([{ table_id: tableId, user_id: userId, message_text: messageText }])
    .select()
    .single();
  if (msgError) throw msgError;
  return txtMsg;
}
