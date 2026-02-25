import { Request, Response } from 'express';
import {
  parseTableCursor,
  buildTableCursor,
  parsePageSize,
} from '../utils/pagination';
import { createLogger } from '../utils/logger';
import { TableRepository, UserRepository } from '../repositories';
import { settleTable } from '../services/table/tableSettlementService';
import { createTableWithHost } from '../services/table/tableCreationService';
import { AppError } from '../errors';
import { getSupabaseAdmin } from '../supabaseClient';

const logger = createLogger('tableController');

export async function listTables(req: Request, res: Response): Promise<void> {
  try {
    const supabase = req.supabase;
    const user = req.authUser;

    if (!supabase || !user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const limit = parsePageSize(req.query.limit);

    const before = parseTableCursor({
      activityAt: req.query.beforeActivityAt,
      tableId: req.query.beforeTableId,
    });
    const after = parseTableCursor({
      activityAt: req.query.afterActivityAt,
      tableId: req.query.afterTableId,
    });

    if (before && after) {
      res.status(400).json({ error: 'Use either before* or after*, not both' });
      return;
    }

    if ((req.query.beforeActivityAt || req.query.beforeTableId) && !before) {
      res.status(400).json({ error: 'Invalid before* cursor' });
      return;
    }

    if ((req.query.afterActivityAt || req.query.afterTableId) && !after) {
      res.status(400).json({ error: 'Invalid after* cursor' });
      return;
    }

    // Use repository for data access
    const tableRepo = new TableRepository(supabase);
    const { data: tables, hasMore } = await tableRepo.listTables({
      userId: user.id,
      limit,
      before: before ?? undefined,
      after: after ?? undefined,
    });

    // Transform to API response format
    const responseData = tables.map((table) => ({
      table_id: table.table_id,
      table_name: table.table_name,
      host_user_id: table.host_user_id,
      host_username: table.host_username,
      created_at: table.created_at,
      last_activity_at: table.last_activity_at,
      memberCount: table.member_count,
    }));

    // Build cursor from raw data for pagination
    const cursorData = responseData.map((t) => ({
      table_id: t.table_id,
      last_activity_at: t.last_activity_at,
    }));

    res.json({
      tables: responseData,
      nextCursor: hasMore ? buildTableCursor(cursorData) : null,
      hasMore,
      serverTime: new Date().toISOString(),
      limit,
    });
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, 'listTables unexpected error');
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /tables/:tableId/settle
 *
 * Settle the table — zero all member balances and record a settlement event.
 * Only the table host may call this endpoint.
 */
export async function settle(req: Request, res: Response): Promise<void> {
  const supabase = req.supabase;
  const user = req.authUser;

  if (!supabase || !user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { tableId } = req.params;

  const result = await settleTable(tableId, user.id);
  res.json(result);
}

/**
 * POST /tables
 *
 * Create a new table. The authenticated user becomes the host and first member.
 */
export async function create(req: Request, res: Response): Promise<void> {
  const user = req.authUser;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { table_name } = req.body ?? {};

  try {
    const result = await createTableWithHost(table_name, user.id);
    res.status(201).json(result);
  } catch (err) {
    if (AppError.isAppError(err)) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    logger.error({ error: err instanceof Error ? err.message : String(err) }, 'createTable error');
    res.status(500).json({ error: 'Failed to create table' });
  }
}

/**
 * POST /tables/:tableId/members
 *
 * Add a user to a table. Only the table host may call this endpoint.
 * The target user must exist. Optionally, the target must be a friend of the host.
 */
export async function addTableMember(req: Request, res: Response): Promise<void> {
  const supabase = req.supabase;
  const user = req.authUser;

  if (!supabase || !user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { tableId } = req.params;
  const { user_id: targetUserId } = req.body as { user_id: string };

  try {
    const adminClient = getSupabaseAdmin();
    const tableRepo = new TableRepository(supabase);

    // Must be the host
    const isHost = await tableRepo.isHost(tableId, user.id);
    if (!isHost) {
      res.status(403).json({ error: 'Only the table host can add members' });
      return;
    }

    // Target user must exist
    const userRepo = new UserRepository(adminClient);
    const targetUser = await userRepo.findById(targetUserId);
    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Cannot add yourself (you're already the host / a member)
    if (targetUserId === user.id) {
      res.status(400).json({ error: 'You are already a member of this table' });
      return;
    }

    // Already a member?
    const alreadyMember = await tableRepo.isMember(tableId, targetUserId);
    if (alreadyMember) {
      res.status(409).json({ error: 'User is already a member of this table' });
      return;
    }

    // Insert via admin client (bypasses RLS "host only" check which uses auth.uid())
    const { error: insertError } = await adminClient
      .from('table_members')
      .insert([{ table_id: tableId, user_id: targetUserId }]);

    if (insertError) {
      logger.error({ error: insertError.message }, 'addTableMember insert failed');
      res.status(500).json({ error: 'Failed to add member' });
      return;
    }

    res.status(201).json({
      table_id: tableId,
      user_id: targetUserId,
      username: targetUser.username,
    });
  } catch (err) {
    if (AppError.isAppError(err)) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    logger.error({ error: err instanceof Error ? err.message : String(err) }, 'addTableMember error');
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * DELETE /tables/:tableId/members/:userId
 *
 * Remove a member from a table. The host may remove any member; a member may remove themselves.
 * The host cannot remove themselves (they must delete the table instead).
 */
export async function removeTableMember(req: Request, res: Response): Promise<void> {
  const supabase = req.supabase;
  const user = req.authUser;

  if (!supabase || !user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { tableId, userId: targetUserId } = req.params;

  try {
    const tableRepo = new TableRepository(supabase);

    // Resolve the table to know who the host is
    const table = await tableRepo.findById(tableId);
    if (!table) {
      res.status(404).json({ error: 'Table not found' });
      return;
    }

    const isHost = table.host_user_id === user.id;
    const isSelf = targetUserId === user.id;

    // Must be host (removing anyone) or self (leaving)
    if (!isHost && !isSelf) {
      res.status(403).json({ error: 'Not authorized to remove this member' });
      return;
    }

    // Host cannot leave their own table
    if (isHost && isSelf) {
      res.status(400).json({ error: 'The host cannot leave the table. Delete the table instead.' });
      return;
    }

    // Target must currently be a member
    const isMember = await tableRepo.isMember(tableId, targetUserId);
    if (!isMember) {
      res.status(404).json({ error: 'User is not a member of this table' });
      return;
    }

    // Delete via admin client so service-role bypasses RLS for host-removing-other case
    const adminClient = getSupabaseAdmin();
    const { error: deleteError } = await adminClient
      .from('table_members')
      .delete()
      .eq('table_id', tableId)
      .eq('user_id', targetUserId);

    if (deleteError) {
      logger.error({ error: deleteError.message }, 'removeTableMember delete failed');
      res.status(500).json({ error: 'Failed to remove member' });
      return;
    }

    res.status(200).json({ removed: true, table_id: tableId, user_id: targetUserId });
  } catch (err) {
    if (AppError.isAppError(err)) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    logger.error({ error: err instanceof Error ? err.message : String(err) }, 'removeTableMember error');
    res.status(500).json({ error: 'Internal server error' });
  }
}
