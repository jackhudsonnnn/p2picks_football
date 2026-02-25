import type { Request, Response } from 'express';
import { getSupabaseAdmin } from '../supabaseClient';
import { createLogger } from '../utils/logger';

const logger = createLogger('userController');

/**
 * PATCH /users/me/username
 *
 * Update the authenticated user's username.
 * - 3–15 characters, letters/numbers/underscores only (enforced by validateBody schema).
 * - Server-side case-insensitive uniqueness check before writing.
 */
export async function updateUsername(req: Request, res: Response): Promise<void> {
  try {
    const supabase = req.supabase;
    const authUser = req.authUser;
    if (!supabase || !authUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { username } = req.body as { username: string };

    // Case-insensitive uniqueness check — exclude the current user so they can re-save
    // the same username with different casing.
    const adminClient = getSupabaseAdmin();
    const { data: existing, error: lookupError } = await adminClient
      .from('users')
      .select('user_id')
      .ilike('username', username)
      .neq('user_id', authUser.id)
      .maybeSingle();

    if (lookupError) {
      logger.error({ error: lookupError.message }, 'updateUsername uniqueness check failed');
      res.status(500).json({ error: 'Failed to check username availability' });
      return;
    }

    if (existing) {
      res.status(409).json({ error: 'Username is already taken' });
      return;
    }

    // Perform the update with service-role so no RLS conflicts
    const { data: updated, error: updateError } = await adminClient
      .from('users')
      .update({ username, updated_at: new Date().toISOString() })
      .eq('user_id', authUser.id)
      .select('user_id, username, email, updated_at')
      .single();

    if (updateError) {
      logger.error({ error: updateError.message }, 'updateUsername write failed');
      res.status(500).json({ error: 'Failed to update username' });
      return;
    }

    res.status(200).json(updated);
  } catch (err) {
    logger.error({ error: (err as Error)?.message }, 'Unexpected error updating username');
    res.status(500).json({ error: 'Internal server error' });
  }
}
