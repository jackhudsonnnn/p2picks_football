import { getSupabaseAdmin } from '../../supabaseClient';

export function formatBetLabel(betId: string): string {
  if (!betId) return 'UNKNOWN';
  const trimmed = betId.trim();
  if (!trimmed) return 'UNKNOWN';
  const short = trimmed.length > 8 ? trimmed.slice(0, 8) : trimmed;
  return short;
}

export async function createWashSystemMessage(tableId: string, betId: string, explanation: string): Promise<void> {
  const supa = getSupabaseAdmin();
  const reason = explanation && explanation.trim().length ? explanation.trim() : 'See resolution history for details.';
  const message = `Bet #${formatBetLabel(betId)} washed\n\n${reason}`;
  const { error } = await supa.from('system_messages').insert([
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
