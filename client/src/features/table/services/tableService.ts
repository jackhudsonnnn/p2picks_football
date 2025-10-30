import {
  createTable as createTableRecord,
  getUserTables as getUserTablesRepo,
  getTable as getTableRepo,
  addTableMember as addTableMemberRepo,
  removeTableMember as removeTableMemberRepo,
  settleTable as settleTableRepo,
  getTableFeed as getTableFeedRepo,
  sendTextMessage as sendTextMessageRepo,
} from '@data/repositories/tablesRepository';
import type {
  TableFeedCursor,
  TableFeedOptions,
  TableFeedPage,
  TableSettlementResult,
} from '@data/repositories/tablesRepository';
import {
  subscribeToTableMembers,
  subscribeToMessages,
  subscribeToBetProposals,
} from '@data/subscriptions/tableSubscriptions';
import { getUsernamesByIds } from '@data/repositories/usersRepository';
import type { TableListItem, TableWithMembers } from '../types';

export type { TableFeedCursor, TableFeedOptions, TableFeedPage, TableSettlementResult };
export { subscribeToTableMembers, subscribeToMessages, subscribeToBetProposals };

export async function fetchCurrentTable(tableId: string): Promise<TableWithMembers | null> {
  if (!tableId) return null;
  const data = await getTableRepo(tableId);
  return (data ?? null) as TableWithMembers | null;
}

export async function fetchUserTables(userId: string): Promise<TableListItem[]> {
  if (!userId) return [];
  const raw = await getUserTablesRepo(userId);
  const hostIds = Array.from(new Set(raw.map((t: any) => t.host_user_id)));
  const idToUsername = await getUsernamesByIds(hostIds);
  return raw.map((t: any) => mapToListItem(t, idToUsername[t.host_user_id] ?? null));
}

export async function createTable(tableName: string, hostUserId: string): Promise<TableListItem> {
  const table = await createTableRecord(tableName, hostUserId);
  const hostNames = await getUsernamesByIds([hostUserId]);
  return mapToListItem(table, hostNames[hostUserId] ?? null, 1);
}

export async function addTableMember(tableId: string, userId: string) {
  await addTableMemberRepo(tableId, userId);
}

export async function removeTableMember(tableId: string, userId: string) {
  await removeTableMemberRepo(tableId, userId);
}

export async function settleTable(tableId: string): Promise<TableSettlementResult> {
  return settleTableRepo(tableId);
}

export async function loadTableFeed(tableId: string, options?: TableFeedOptions): Promise<TableFeedPage> {
  return getTableFeedRepo(tableId, options);
}

export async function sendTextMessage(tableId: string, userId: string, messageText: string) {
  return sendTextMessageRepo(tableId, userId, messageText);
}

function mapToListItem(table: any, hostUsername: string | null, memberCount?: number): TableListItem {
  const count = typeof memberCount === 'number' ? memberCount : (table.table_members || []).length;
  return {
    table_id: table.table_id,
    table_name: table.table_name,
    host_user_id: table.host_user_id,
    created_at: table.created_at,
    last_activity_at: table.last_activity_at ?? table.created_at,
    host_username: hostUsername,
    memberCount: count,
  };
}
