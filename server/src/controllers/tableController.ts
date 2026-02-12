import { Request, Response } from 'express';
import {
  parseTableCursor,
  buildTableCursor,
  parsePageSize,
  normalizeTimestamp,
  type TableCursor,
} from '../utils/pagination';

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

    let query = supabase
      .from('tables')
      .select(
        `
        table_id,
        table_name,
        host_user_id,
        created_at,
        last_activity_at,
        host:host_user_id (username),
        table_members (user_id)
      `,
      )
  .order('last_activity_at', { ascending: false, nullsFirst: false })
      .order('table_id', { ascending: false })
      .limit(limit + 1);

    if (before) {
      const ts = before.activityAt;
      query = query.or(
        `and(last_activity_at.lt.${ts}),and(last_activity_at.eq.${ts},table_id.lt.${before.tableId})`,
      );
    }

    if (after) {
      const ts = after.activityAt;
      query = query.or(
        `and(last_activity_at.gt.${ts}),and(last_activity_at.eq.${ts},table_id.gt.${after.tableId})`,
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error('[tableController] listTables query error:', error);
      res.status(500).json({ error: 'Failed to fetch tables' });
      return;
    }

    let rows = (data ?? []) as any[];
    const hasMore = rows.length > limit;
    if (hasMore) {
      rows = rows.slice(0, limit);
    }

    const tables = rows.map((row) => {
      const activityAt = normalizeTimestamp(row.last_activity_at ?? row.created_at ?? null);
      const createdAt = normalizeTimestamp(row.created_at);
      const memberCount = Array.isArray(row.table_members) ? row.table_members.length : null;
      return {
        table_id: row.table_id,
        table_name: row.table_name,
        host_user_id: row.host_user_id,
        host_username: row.host?.username ?? null,
        created_at: createdAt,
        last_activity_at: activityAt,
        memberCount,
      };
    });

    res.json({
      tables,
      nextCursor: hasMore ? buildTableCursor(rows) : null,
      hasMore,
      serverTime: new Date().toISOString(),
      limit,
    });
  } catch (err) {
    console.error('[tableController] listTables unexpected error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
