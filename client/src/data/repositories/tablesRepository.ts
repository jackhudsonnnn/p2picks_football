import { supabase } from '@data/clients/supabaseClient';
import { fetchJSON } from '@data/clients/restClient';
import type { Tables } from '@data/types/database.types';
import type { ChatMessage } from '@shared/types/chat';

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
  bust_balance: TableMemberRow['bust_balance'] | null;
  push_balance: TableMemberRow['push_balance'] | null;
  sweep_balance: TableMemberRow['sweep_balance'] | null;
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
      bust_balance: typeof member.bust_balance === 'number' ? member.bust_balance : null,
      push_balance: typeof member.push_balance === 'number' ? member.push_balance : null,
      sweep_balance: typeof member.sweep_balance === 'number' ? member.sweep_balance : null,
      users: member.users ? { username: member.users.username ?? null } : null,
    }));
}

export async function createTable(tableName: string, _hostUserId: string): Promise<TableRow> {
  const result = await fetchJSON<TableRow>('/api/tables', {
    method: 'POST',
    body: JSON.stringify({ table_name: tableName }),
  });
  return result;
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
    .select('table_id, table_name, host_user_id, created_at, last_activity_at, table_members(user_id, bust_balance, push_balance, sweep_balance, users(username))')
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

export async function addTableMember(tableId: string, userId: string): Promise<void> {
  await fetchJSON<{ table_id: string; user_id: string; username: string | null }>(
    `/api/tables/${encodeURIComponent(tableId)}/members`,
    {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    },
  );
}

export async function removeTableMember(tableId: string, userId: string): Promise<void> {
  await fetchJSON<{ removed: boolean }>(
    `/api/tables/${encodeURIComponent(tableId)}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
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

export async function settleTable(tableId: string): Promise<TableSettlementResult> {
  if (!tableId) {
    throw new Error('tableId is required to settle a table');
  }

  const result = await fetchJSON<{
    tableId: string;
    settledAt: string;
    memberCount: number;
    balances: Array<{
      userId: string;
      bustBalanceBefore: number;
      pushBalanceBefore: number;
      sweepBalanceBefore: number;
    }>;
  }>(`/api/tables/${encodeURIComponent(tableId)}/settle`, { method: 'POST' });

  return {
    summary: `Table settled. ${result.memberCount} member(s) reset.`,
    messageId: '',
    generatedAt: result.settledAt,
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
