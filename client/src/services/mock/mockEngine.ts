// Mock resolver engine: after the active window ends, mark pending (via chat text)
// and 20s later randomly pick a winner (via chat text). This avoids RLS on system_notifications.

import { MODES, ModeKey } from '../../modes';
import { putResolution, getResolution } from './mockStore';
import { sendTextMessage } from '../tableService';
import { supabase } from '../supabaseClient';

// Public API: schedule a mock resolution for a bet
export function scheduleMockResolution(opts: {
  bet: any; // freshly inserted bet row
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

  // 1) When active window ends, announce PENDING as a text message (attribute to proposer)
  setTimeout(async () => {
    try {
      // Update DB status to pending if still active
      await supabase
        .from('bet_proposals')
        .update({ bet_status: 'pending' })
        .eq('bet_id', bet.bet_id)
        .eq('bet_status', 'active');

      const text = `Bet ${bet.bet_id.slice(0, 8)} is now pending.`;
      // Attribute as the proposer to pass RLS for text_messages
      await sendTextMessage(tableId, bet.proposer_user_id, text);
    } catch (_) {
      // swallow for POC
    }
  }, msUntilPending);

  // 2) After 20s in pending, announce RESOLVED with a random winner
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
      const text = `Bet ${bet.bet_id.slice(0, 8)} resolved. Winning choice: "${winning}".`;
      await sendTextMessage(tableId, bet.proposer_user_id, text);
    } catch (_) {
      // swallow for POC
    }
  }, msUntilResolved);
}
