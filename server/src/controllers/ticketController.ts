import type { Request, Response } from 'express';
import {
  parseTicketCursor,
  buildTicketCursor,
  parsePageSize,
} from '../utils/pagination';
import { createLogger } from '../utils/logger';
import { TicketRepository } from '../repositories';

const logger = createLogger('ticketController');

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

    const limit = parsePageSize(req.query.limit);

    const before = parseTicketCursor({
      participatedAt: req.query.beforeParticipatedAt,
      participationId: req.query.beforeParticipationId,
    });
    const after = parseTicketCursor({
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

    // Use repository for data access
    const ticketRepo = new TicketRepository(supabase);
    const { data: tickets, hasMore } = await ticketRepo.listTickets({
      userId: user.id,
      limit,
      before: before ?? undefined,
      after: after ?? undefined,
    });

    // Transform to API response format (matching legacy structure)
    const participations = tickets.map((ticket) => ({
      participation_id: ticket.participation_id,
      bet_id: ticket.bet_id,
      table_id: ticket.table_id,
      user_id: ticket.user_id,
      user_guess: ticket.user_guess,
      participation_time: ticket.participation_time,
      bet_proposals: ticket.bet,
    }));

    // Build cursor from raw data
    const cursorData = participations.map((p) => ({
      participation_id: p.participation_id,
      participation_time: p.participation_time,
    }));

    res.json({
      participations,
      nextCursor: hasMore ? buildTicketCursor(cursorData) : null,
      hasMore,
      limit,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, 'listTickets unexpected error');
    res.status(500).json({ error: 'Internal server error' });
  }
}