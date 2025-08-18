// Mock resolver engine: after the active window ends, mark pending (via chat text)
// and 20s later randomly pick a winner (via chat text). This avoids RLS on system_messages.

import { MODES, ModeKey } from '../../modes';
import { putResolution, getResolution } from './mockStore';
// System notifications on resolution are now created by a DB trigger (Option A)
import { supabase } from '../supabaseClient';

// Public API: schedule a mock resolution for a bet
export function scheduleMockResolution(opts: {
  bet: any;
  tableId: string;
}): void {
  const { bet, tableId } = opts;
  const modeKey = (bet.mode_key || 'best_of_best') as ModeKey;
  const mode = MODES[modeKey];
  if (!mode) return;

  const proposalMs = bet?.proposal_time ? new Date(bet.proposal_time).getTime() : Date.now();
  const activeSeconds = Number(bet?.time_limit_seconds) || 0;
  const activeEndsMs = proposalMs + activeSeconds * 1000;
  const nowMs = Date.now();
  const msUntilPending = Math.max(0, activeEndsMs - nowMs);
  const msUntilResolved = msUntilPending + 20_000; // pending + 20s

  // Track resolve_at in-memory for POC
  putResolution({ bet_id: bet.bet_id, table_id: tableId, resolve_at: nowMs + msUntilResolved, winning_choice: null });

  // 1) When active window ends, flip to PENDING in DB (no user-attributed message)
  setTimeout(async () => {
    try {
      // Update DB status to pending if still active
      await supabase
        .from('bet_proposals')
        .update({ bet_status: 'pending' })
        .eq('bet_id', bet.bet_id)
        .eq('bet_status', 'active');
    } catch (_) {
      // swallow for POC
    }
  }, msUntilPending);

  // 2) After 20s in pending, resolve the bet in DB; a DB trigger will post a SYSTEM message
  setTimeout(async () => {
    try {
      const winning = mode.pickRandomWinner({ bet });
      const rec = getResolution(bet.bet_id);
      if (rec) rec.winning_choice = winning;

      // Update DB status to resolved with winning_choice only if still pending
      await supabase
        .from('bet_proposals')
        .update({ bet_status: 'resolved', winning_choice: winning, resolution_time: new Date().toISOString() })
        .eq('bet_id', bet.bet_id)
        .eq('bet_status', 'pending');
  // DB trigger will insert a system_message + feed_item; no client message here
    } catch (_) {
      // swallow for POC
    }
  }, msUntilResolved);
}
