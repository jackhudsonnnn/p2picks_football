import { Request, Response } from 'express';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

type TableCursor = {
  activityAt: string;
  tableId: string;
};

function normalizeTimestamp(value: string | null | undefined): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function isValidIso(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function isValidTableId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseCursor(raw: any): TableCursor | null {
  if (!raw) return null;
  const activityAt = typeof raw.activityAt === 'string' ? raw.activityAt : undefined;
  const tableId = typeof raw.tableId === 'string' ? raw.tableId : undefined;
  if (!activityAt || !tableId) return null;
  if (!isValidIso(activityAt) || !isValidTableId(tableId)) return null;
  return { activityAt: new Date(activityAt).toISOString(), tableId };
}

function buildNextCursor(rows: any[]): TableCursor | null {
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const activityAt = normalizeTimestamp(last.last_activity_at ?? last.created_at ?? null);
  if (!last.table_id || !activityAt) return null;
  return {
    activityAt,
    tableId: String(last.table_id),
  };
}

export async function listTables(req: Request, res: Response): Promise<void> {
  try {
    const supabase = req.supabase;
    const user = req.authUser;

    if (!supabase || !user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const rawLimit = Number(req.query.limit ?? DEFAULT_PAGE_SIZE);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

    const before = parseCursor({
      activityAt: req.query.beforeActivityAt,
      tableId: req.query.beforeTableId,
    });
    const after = parseCursor({
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
      nextCursor: hasMore ? buildNextCursor(rows) : null,
      hasMore,
      serverTime: new Date().toISOString(),
      limit,
    });
  } catch (err) {
    console.error('[tableController] listTables unexpected error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
