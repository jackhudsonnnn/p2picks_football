import type { Request, Response } from 'express';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

type TicketCursor = {
  participatedAt: string;
  participationId: string;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGITS_REGEX = /^\d+$/;

function isValidParticipationId(raw: string | undefined): raw is string {
  if (!raw) return false;
  return UUID_REGEX.test(raw) || DIGITS_REGEX.test(raw);
}

function parseCursor(raw: any): TicketCursor | null {
  if (!raw) return null;
  const participatedAt = typeof raw.participatedAt === 'string' ? raw.participatedAt : undefined;
  const participationId =
    typeof raw.participationId === 'string' && isValidParticipationId(raw.participationId)
      ? raw.participationId
      : undefined;
  if (!participatedAt || !participationId) return null;
  const date = new Date(participatedAt);
  if (Number.isNaN(date.getTime())) return null;
  return { participatedAt: date.toISOString(), participationId };
}

function normalizeTimestamp(value: string | null | undefined): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function buildNextCursor(rows: any[]): TicketCursor | null {
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  return {
    participatedAt: normalizeTimestamp(last.participation_time),
    participationId: String(last.participation_id),
  };
}

/**
 * GET /tickets
 *
 * Cursor-based pagination over a user's bet participations ("tickets").
 * Query params:
 * - limit?: number (default 20, max 100)
 * - beforeParticipatedAt?: ISO string
 * - beforeParticipationId?: string
 * - afterParticipatedAt?: ISO string (optional; mutually exclusive with before*)
 * - afterParticipationId?: string
 */
export async function listTickets(req: Request, res: Response): Promise<void> {
  try {
    const user = req.authUser;
    const supabase = req.supabase;

    if (!user || !supabase) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const rawLimit = Number(req.query.limit ?? DEFAULT_PAGE_SIZE);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

    const before = parseCursor({
      participatedAt: req.query.beforeParticipatedAt,
      participationId: req.query.beforeParticipationId,
    });
    const after = parseCursor({
      participatedAt: req.query.afterParticipatedAt,
      participationId: req.query.afterParticipationId,
    });

    if (before && after) {
      res.status(400).json({ error: 'Use either before* or after*, not both' });
      return;
    }

    if ((req.query.beforeParticipatedAt || req.query.beforeParticipationId) && !before) {
      res.status(400).json({ error: 'Invalid before* cursor' });
      return;
    }

    if ((req.query.afterParticipatedAt || req.query.afterParticipationId) && !after) {
      res.status(400).json({ error: 'Invalid after* cursor' });
      return;
    }

    let query = supabase
      .from('bet_participations')
      .select(
        `
        participation_id,
        bet_id,
        table_id,
        user_id,
        user_guess,
        participation_time,
        bet_proposals:bet_id (
          bet_id,
          table_id,
          nfl_game_id,
          mode_key,
          description,
          wager_amount,
          time_limit_seconds,
          proposal_time,
          bet_status,
          close_time,
          winning_choice,
          resolution_time,
          tables:table_id (table_name)
        )
      `,
      )
      .eq('user_id', user.id)
      // Matches index: bet_participations_user_time_id_desc (user_id, participation_time DESC, participation_id DESC)
      .order('participation_time', { ascending: false })
      .order('participation_id', { ascending: false })
      .limit(limit + 1);

    if (before) {
      const participatedAtIso = before.participatedAt;
      query = query.or(
        `and(participation_time.lt.${participatedAtIso}),and(participation_time.eq.${participatedAtIso},participation_id.lt.${before.participationId})`,
      );
    }

    if (after) {
      const participatedAtIso = after.participatedAt;
      query = query.or(
        `and(participation_time.gt.${participatedAtIso}),and(participation_time.eq.${participatedAtIso},participation_id.gt.${after.participationId})`,
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error('[ticketController] listTickets query error:', error);
      res.status(500).json({ error: 'Failed to fetch tickets' });
      return;
    }

    let rows = (data ?? []) as any[];
    const hasMore = rows.length > limit;
    if (hasMore) {
      rows = rows.slice(0, limit);
    }

    res.json({
      participations: rows,
      nextCursor: hasMore ? buildNextCursor(rows) : null,
      hasMore,
      limit,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[ticketController] listTickets unexpected error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}