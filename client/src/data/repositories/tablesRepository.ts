import { supabase } from '@data/clients/supabaseClient';
import { fetchJSON } from '@data/clients/restClient';
import type { Tables } from '@data/types/database.types';
import type { ChatMessage } from '@shared/types/chat';
import { normalizeToHundredth } from '@shared/utils/number';

export type TableRow = Tables<'tables'>;
type TableMemberRow = Tables<'table_members'>;
type UserRow = Tables<'users'>;

export interface TableListCursor {
  activityAt: string;
  tableId: string;
}

export type TableListItemPayload = {
  table_id: string;
  table_name: string;
  host_user_id: string;
  host_username: string | null;
  created_at: string;
  last_activity_at: string;
  memberCount: number | null;
};

export interface TableListPage {
  tables: TableListItemPayload[];
  nextCursor: TableListCursor | null;
  hasMore: boolean;
  limit: number;
  serverTime?: string;
}

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

export async function getUserTablesPage(options: {
  limit?: number;
  before?: TableListCursor | null;
  after?: TableListCursor | null;
}): Promise<TableListPage> {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  if (options.before) {
    params.set('beforeActivityAt', options.before.activityAt);
    params.set('beforeTableId', options.before.tableId);
  }
  if (options.after) {
    params.set('afterActivityAt', options.after.activityAt);
    params.set('afterTableId', options.after.tableId);
  }

  const qs = params.toString();
  const url = `/api/tables${qs ? `?${qs}` : ''}`;
  return fetchJSON<TableListPage>(url, { method: 'GET' });
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
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (before) {
    params.set('beforePostedAt', before.postedAt);
    params.set('beforeMessageId', before.messageId);
  }

  const queryString = params.toString();
  const url = `/api/tables/${encodeURIComponent(tableId)}/messages${queryString ? `?${queryString}` : ''}`;

  const response = await fetchJSON<{
    messages: ChatMessage[];
    nextCursor: TableFeedCursor | null;
    hasMore: boolean;
    serverTime?: string;
    limit?: number;
  }>(url, { method: 'GET' });

  return {
    messages: response.messages ?? [],
    nextCursor: response.nextCursor ?? null,
    hasMore: Boolean(response.hasMore),
  };
}

export async function sendTextMessage(tableId: string, userId: string, messageText: string) {
  const response = await fetchJSON<{
    success: boolean;
    messageId: string;
    postedAt: string;
    error?: string;
    retryAfter?: number;
  }>(`/api/tables/${encodeURIComponent(tableId)}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: messageText }),
  });

  if (!response.success) {
    const error = new Error(response.error ?? 'Failed to send message') as Error & {
      retryAfter?: number;
    };
    if (response.retryAfter) {
      error.retryAfter = response.retryAfter;
    }
    throw error;
  }

  return {
    text_message_id: response.messageId,
    posted_at: response.postedAt,
    table_id: tableId,
    user_id: userId,
    message_text: messageText,
  };
}
