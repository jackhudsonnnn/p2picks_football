import { Request, Response } from 'express';
import {
  parseTableCursor,
  buildTableCursor,
  parsePageSize,
} from '../utils/pagination';
import { createLogger } from '../utils/logger';
import { TableRepository } from '../repositories';
import { settleTable } from '../services/table/tableSettlementService';

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

  const result = await settleTable(tableId, user.id, supabase);
  res.json(result);
}
