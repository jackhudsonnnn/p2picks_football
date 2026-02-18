import { getSupabaseAdmin } from '../../supabaseClient';
import { createLogger } from '../../utils/logger';

const logger = createLogger('washService');

export interface WashOptions {
  betId: string;
  payload: Record<string, unknown>;
  explanation: string;
  eventType: string;
  modeLabel: string;
}

function formatBetLabel(betId: string): string {
  if (!betId) return 'UNKNOWN';
  const trimmed = betId.trim();
  if (!trimmed) return 'UNKNOWN';
  const short = trimmed.length > 8 ? trimmed.slice(0, 8) : trimmed;
  return short;
}

async function createWashSystemMessage(tableId: string, betId: string, explanation: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const reason = explanation && explanation.trim().length ? explanation.trim() : 'See resolution history for details.';
  const message = `Bet #${formatBetLabel(betId)} washed\n\n${reason}`;
  const { error } = await supabase.from('system_messages').insert([
    {
      table_id: tableId,
      message_text: message,
      generated_at: new Date().toISOString(),
    },
  ]);
  if (error) {
    logger.error({ betId, tableId, error: error.message }, 'failed to create wash system message');
  }
}

/**
 * Atomically washes a bet and records its history in a single database
 * transaction via the `wash_bet_with_history` RPC.
 *
 * Previously this was two separate calls (UPDATE + INSERT) which could leave
 * orphaned state if the server crashed between them.
 */
export async function washBetWithHistory({ betId, payload, explanation, eventType, modeLabel }: WashOptions): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const fullPayload = { outcome: 'wash', mode: modeLabel, ...payload };

    const { data, error } = await supabase.rpc('wash_bet_with_history', {
      p_bet_id: betId,
      p_event_type: eventType,
      p_payload: fullPayload,
    });

    if (error) {
      logger.error({ betId, error: error.message }, 'wash_bet_with_history RPC error');
      return;
    }

    if (!data) {
      logger.warn({ betId }, 'wash skipped; bet not pending');
      return;
    }

    // data is { bet_id, table_id }
    const tableId = typeof data === 'object' && data !== null ? (data as Record<string, unknown>).table_id : null;
    if (tableId && typeof tableId === 'string') {
      await createWashSystemMessage(tableId, betId, explanation);
    }
  } catch (err) {
    logger.error({ betId, error: err instanceof Error ? err.message : String(err) }, 'wash bet error');
  }
}
