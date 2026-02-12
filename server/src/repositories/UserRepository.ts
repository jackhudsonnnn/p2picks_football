/**
 * User Repository
 *
 * Data access for user entities.
 * Handles queries related to user profiles and lookups.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { BaseRepository } from './BaseRepository';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface User {
  user_id: string;
  username: string;
  created_at: string;
}

export interface UserProfile extends User {
  display_name: string | null;
  avatar_url: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository
// ─────────────────────────────────────────────────────────────────────────────

export class UserRepository extends BaseRepository {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'userRepository');
  }

  /**
   * Find a user by ID.
   */
  async findById(userId: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from('users')
      .select('user_id, username, created_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw this.wrapError('findById query error', error, { userId });
    }

    return data as User | null;
  }

  /**
   * Find a user by username.
   */
  async findByUsername(username: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from('users')
      .select('user_id, username, created_at')
      .eq('username', username)
      .maybeSingle();

    if (error) {
      throw this.wrapError('findByUsername query error', error, { username });
    }

    return data as User | null;
  }

  /**
   * Check if a username exists.
   */
  async usernameExists(username: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('users')
      .select('user_id')
      .eq('username', username)
      .maybeSingle();

    if (error) {
      throw this.wrapError('usernameExists query error', error, { username });
    }

    return data !== null;
  }

  /**
   * Search users by username prefix.
   */
  async searchByUsername(prefix: string, limit = 10): Promise<User[]> {
    const { data, error } = await this.supabase
      .from('users')
      .select('user_id, username, created_at')
      .ilike('username', `${prefix}%`)
      .limit(limit);

    if (error) {
      throw this.wrapError('searchByUsername query error', error, { prefix, limit });
    }

    return (data ?? []) as User[];
  }

  /**
   * Get multiple users by IDs.
   */
  async findByIds(userIds: string[]): Promise<User[]> {
    if (!userIds.length) return [];

    const { data, error } = await this.supabase
      .from('users')
      .select('user_id, username, created_at')
      .in('user_id', userIds);

    if (error) {
      throw this.wrapError('findByIds query error', error, { userIds });
    }

    return (data ?? []) as User[];
  }

  /**
   * Get user profile with extended information.
   */
  async getProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await this.supabase
      .from('users')
      .select('user_id, username, created_at, display_name, avatar_url')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw this.wrapError('getProfile query error', error, { userId });
    }

    return data as UserProfile | null;
  }

  /**
   * Update user profile.
   */
  async updateProfile(
    userId: string,
    updates: Partial<Pick<UserProfile, 'display_name' | 'avatar_url'>>,
  ): Promise<UserProfile | null> {
    const { data, error } = await this.supabase
      .from('users')
      .update(updates)
      .eq('user_id', userId)
      .select('user_id, username, created_at, display_name, avatar_url')
      .maybeSingle();

    if (error) {
      throw this.wrapError('updateProfile error', error, { userId, updates });
    }

    return data as UserProfile | null;
  }
}
