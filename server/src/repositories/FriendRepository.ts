/**
 * Friend Repository
 *
 * Data access for friend relationships.
 * Handles queries related to user friendships.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { BaseRepository, type PaginatedResult } from './BaseRepository';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Friend {
  friend_id: string;
  user_id: string;
  friend_user_id: string;
  created_at: string;
}

export interface FriendWithUser extends Friend {
  friend_username: string | null;
}

export interface ListFriendsOptions {
  userId: string;
  limit?: number;
  offset?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository
// ─────────────────────────────────────────────────────────────────────────────

export class FriendRepository extends BaseRepository {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'friendRepository');
  }

  /**
   * List friends for a user with offset pagination.
   */
  async listFriends(options: ListFriendsOptions): Promise<PaginatedResult<FriendWithUser>> {
    const { userId, offset = 0 } = options;
    const limit = this.parseLimit(options.limit);

    const { data, error } = await this.supabase
      .from('friends')
      .select(
        `
        friend_id,
        user_id,
        friend_user_id,
        created_at,
        friend:friend_user_id (username)
      `,
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit);

    if (error) {
      throw this.wrapError('listFriends query error', error, { userId, offset, limit });
    }

    const rows = (data ?? []) as any[];
    const hasMore = rows.length > limit;
    const friends: FriendWithUser[] = rows.slice(0, limit).map((row) => ({
      friend_id: row.friend_id,
      user_id: row.user_id,
      friend_user_id: row.friend_user_id,
      created_at: row.created_at,
      friend_username: row.friend?.username ?? null,
    }));

    return { data: friends, hasMore };
  }

  /**
   * Check if two users are friends.
   */
  async areFriends(userId: string, friendUserId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('friends')
      .select('friend_id')
      .eq('user_id', userId)
      .eq('friend_user_id', friendUserId)
      .maybeSingle();

    if (error) {
      throw this.wrapError('areFriends query error', error, { userId, friendUserId });
    }

    return data !== null;
  }

  /**
   * Add a friend relationship.
   * Note: This creates a one-way relationship. For mutual friendship,
   * call this method twice with reversed user IDs.
   */
  async addFriend(userId: string, friendUserId: string): Promise<Friend> {
    const { data, error } = await this.supabase
      .from('friends')
      .insert([
        {
          user_id: userId,
          friend_user_id: friendUserId,
        },
      ])
      .select('friend_id, user_id, friend_user_id, created_at')
      .single();

    if (error) {
      throw this.wrapError('addFriend error', error, { userId, friendUserId });
    }

    return data as Friend;
  }

  /**
   * Remove a friend relationship.
   */
  async removeFriend(userId: string, friendUserId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('friends')
      .delete()
      .eq('user_id', userId)
      .eq('friend_user_id', friendUserId)
      .select('friend_id');

    if (error) {
      throw this.wrapError('removeFriend error', error, { userId, friendUserId });
    }

    return Boolean(data && data.length > 0);
  }

  /**
   * Count friends for a user.
   */
  async countFriends(userId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('friends')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      throw this.wrapError('countFriends error', error, { userId });
    }

    return count ?? 0;
  }
}
