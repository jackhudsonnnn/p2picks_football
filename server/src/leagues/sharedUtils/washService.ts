import { betRepository } from './betRepository';
import { getSupabaseAdmin } from '../../supabaseClient';

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
    console.error('[washMessage] failed to create wash system message', { betId, tableId }, error);
  }
}

export async function washBetWithHistory({ betId, payload, explanation, eventType, modeLabel }: WashOptions): Promise<void> {
  try {
    const washed = await betRepository.washBet(betId);
    if (!washed) {
      console.warn('[washService] wash skipped; bet not pending', { betId });
      return;
    }
    await betRepository.recordHistory(betId, eventType, { outcome: 'wash', mode: modeLabel, ...payload });
    if (washed.table_id) {
      await createWashSystemMessage(washed.table_id, betId, explanation);
    }
  } catch (err) {
    console.error('[washService] wash bet error', { betId }, err);
  }
}
