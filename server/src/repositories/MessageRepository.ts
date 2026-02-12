/**
 * Message Repository
 *
 * Data access for chat messages within tables.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { BaseRepository, type PaginatedResult } from './BaseRepository';
import { normalizeTimestamp } from '../utils/pagination';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Message {
  message_id: string;
  table_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface MessageWithUser extends Message {
  username: string | null;
}

export interface MessageCursor {
  createdAt: string;
  messageId: string;
}

export interface ListMessagesOptions {
  tableId: string;
  limit?: number;
  before?: MessageCursor;
  after?: MessageCursor;
}

export interface CreateMessageInput {
  tableId: string;
  userId: string;
  content: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository
// ─────────────────────────────────────────────────────────────────────────────

export class MessageRepository extends BaseRepository {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'messageRepository');
  }

  /**
   * List messages for a table with cursor-based pagination.
   */
  async listMessages(options: ListMessagesOptions): Promise<PaginatedResult<MessageWithUser>> {
    const { tableId, before, after } = options;
    const limit = this.parseLimit(options.limit);

    let query = this.supabase
      .from('messages')
      .select(
        `
        message_id,
        table_id,
        user_id,
        content,
        created_at,
        user:user_id (username)
      `,
      )
      .eq('table_id', tableId)
      .order('created_at', { ascending: false })
      .order('message_id', { ascending: false })
      .limit(limit + 1);

    if (before) {
      query = query.or(
        `and(created_at.lt.${before.createdAt}),and(created_at.eq.${before.createdAt},message_id.lt.${before.messageId})`,
      );
    }

    if (after) {
      query = query.or(
        `and(created_at.gt.${after.createdAt}),and(created_at.eq.${after.createdAt},message_id.gt.${after.messageId})`,
      );
    }

    const { data, error } = await query;
    if (error) {
      throw this.wrapError('listMessages query error', error, { tableId, before, after });
    }

    let rows = (data ?? []) as any[];
    const hasMore = rows.length > limit;
    if (hasMore) {
      rows = rows.slice(0, limit);
    }

    const messages: MessageWithUser[] = rows.map((row) => ({
      message_id: row.message_id,
      table_id: row.table_id,
      user_id: row.user_id,
      content: row.content,
      created_at: normalizeTimestamp(row.created_at),
      username: row.user?.username ?? null,
    }));

    return { data: messages, hasMore };
  }

  /**
   * Find a message by ID.
   */
  async findById(messageId: string): Promise<Message | null> {
    const { data, error } = await this.supabase
      .from('messages')
      .select('message_id, table_id, user_id, content, created_at')
      .eq('message_id', messageId)
      .maybeSingle();

    if (error) {
      throw this.wrapError('findById query error', error, { messageId });
    }

    return data as Message | null;
  }

  /**
   * Create a new message.
   */
  async create(input: CreateMessageInput): Promise<Message> {
    const { data, error } = await this.supabase
      .from('messages')
      .insert([
        {
          table_id: input.tableId,
          user_id: input.userId,
          content: input.content,
        },
      ])
      .select('message_id, table_id, user_id, content, created_at')
      .single();

    if (error) {
      throw this.wrapError('create message error', error, { ...input });
    }

    return data as Message;
  }

  /**
   * Delete a message.
   */
  async delete(messageId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('messages')
      .delete()
      .eq('message_id', messageId)
      .select('message_id');

    if (error) {
      throw this.wrapError('delete message error', error, { messageId });
    }

    return Boolean(data && data.length > 0);
  }

  /**
   * Count messages in a table.
   */
  async countMessages(tableId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('table_id', tableId);

    if (error) {
      throw this.wrapError('countMessages error', error, { tableId });
    }

    return count ?? 0;
  }
}
