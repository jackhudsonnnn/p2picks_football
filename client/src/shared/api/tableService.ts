// Moved from src/entities/table/service.ts
import { supabase } from '@shared/api/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { ChatMessage } from '@shared/types/chat';
import { formatTimeOfDay } from '@shared/utils/dateTime';

export async function createTable(tableName: string, hostUserId: string) {
  const { data: table, error } = await supabase
    .from('tables')
    .insert([{ table_name: tableName, host_user_id: hostUserId }])
    .select()
    .single();
  if (error) throw error;
  await supabase.from('table_members').insert([
    { table_id: table.table_id, user_id: hostUserId }
  ]);
  return table;
}

export async function getUserTables(userId: string) {
  const { data, error } = await supabase
    .from('table_members')
    .select('table_id, tables(*, table_members(*))')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map((row: any) => row.tables);
}

export async function getTable(tableId: string) {
  const { data: table, error } = await supabase
    .from('tables')
    .select('*, table_members(*, users(*))')
    .eq('table_id', tableId)
    .single();
  if (error) throw error;
  if (table && !table.table_members) {
    (table as any).table_members = [];
  }
  return table;
}

export async function addTableMember(tableId: string, userId: string) {
  const { error } = await supabase
    .from('table_members')
    .insert([{ table_id: tableId, user_id: userId }]);
  if (error) throw error;
}

export async function removeTableMember(tableId: string, userId: string) {
  const { error } = await supabase
    .from('table_members')
    .delete()
    .eq('table_id', tableId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function getTableFeed(tableId: string): Promise<ChatMessage[]> {
  const [
    { data: textData, error: textError },
    { data: systemData, error: systemError },
    { data: betData, error: betError }
  ] = await Promise.all([
    supabase
      .from('text_messages')
      .select('text_message_id, table_id, user_id, message_text, posted_at, users:user_id (username)')
      .eq('table_id', tableId)
      .order('posted_at', { ascending: true }),
    supabase
      .from('system_messages')
      .select('system_message_id, table_id, message_text, generated_at')
      .eq('table_id', tableId)
      .order('generated_at', { ascending: true }),
    supabase
      .from('bet_proposals')
      .select(`
        bet_id,
        table_id,
        proposer_user_id,
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
        users:proposer_user_id (username),
        bet_mode_best_of_best!bet_mode_best_of_best_bet_id_fkey (player1_name, player2_name, stat, resolve_after, baseline_player1, baseline_player2, baseline_captured_at),
        bet_mode_one_leg_spread!bet_mode_one_leg_spread_bet_id_fkey (bet_id, home_team_id, home_team_name, away_team_id, away_team_name),
        bet_mode_scorcerer!bet_mode_scorcerer_bet_id_fkey (bet_id, baseline_touchdowns, baseline_field_goals, baseline_safeties, baseline_captured_at),
        bet_mode_choose_their_fate!bet_mode_choose_their_fate_bet_id_fkey (bet_id, possession_team_id, possession_team_name, baseline_captured_at)
      `)
      .eq('table_id', tableId)
      .order('proposal_time', { ascending: true })
  ]);

  if (textError) throw textError;
  if (systemError) throw systemError;
  if (betError) throw betError;

  const messages: ChatMessage[] = [];

  (textData ?? []).forEach((msg: any) => {
    const username = msg?.users?.username ?? 'Unknown';
    messages.push({
      id: msg.text_message_id,
      type: 'chat',
      senderUserId: msg.user_id,
      senderUsername: username,
      text: msg.message_text,
      timestamp: msg.posted_at,
      tableId: msg.table_id,
    });
  });

  (systemData ?? []).forEach((msg: any) => {
    messages.push({
      id: msg.system_message_id,
      type: 'system',
      senderUserId: '',
      senderUsername: '',
      text: msg.message_text,
      timestamp: msg.generated_at,
      tableId: msg.table_id,
    });
  });

  (betData ?? []).forEach((bet: any) => {
    const username = bet?.users?.username ?? 'Unknown';
    const description = bet.description || 'Bet';

    messages.push({
      id: bet.bet_id,
      type: 'bet_proposal',
      senderUserId: bet.proposer_user_id,
      senderUsername: username,
      text: '',
      timestamp: bet.proposal_time,
      betProposalId: bet.bet_id,
      betDetails: {
        description,
        wager_amount: bet.wager_amount,
        time_limit_seconds: bet.time_limit_seconds,
        bet_status: bet.bet_status,
        close_time: bet.close_time,
        winning_choice: bet.winning_choice,
        resolution_time: bet.resolution_time,
        mode_key: bet.mode_key,
        nfl_game_id: bet.nfl_game_id,
      },
      tableId: bet.table_id,
    });

    const betIdShort = bet.bet_id?.slice(0, 8) ?? '';
    const closeTimeText = formatTimeOfDay(bet.close_time, { includeSeconds: true });
    const detailLines: string[] = [
      `Join my bet #${betIdShort}.`,
      `${bet.wager_amount} pt(s) | ${bet.time_limit_seconds}s to pick`,
      bet.mode_key,
      description,
      closeTimeText ? `Closes at ${closeTimeText}` : null,
    ].filter(Boolean) as string[];

    messages.push({
      id: `${bet.bet_id}-details`,
      type: 'chat',
      senderUserId: bet.proposer_user_id,
      senderUsername: username,
      text: detailLines.join('\n'),
      timestamp: bet.proposal_time,
      tableId: bet.table_id,
    });
  });

  messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return messages;
}

export async function sendTextMessage(tableId: string, userId: string, messageText: string) {
  const { data: txtMsg, error: msgError } = await supabase
    .from('text_messages')
    .insert([{ table_id: tableId, user_id: userId, message_text: messageText }])
    .select()
    .single();
  if (msgError) throw msgError;
  return txtMsg;
}

export function subscribeToTableMembers(
  tableId: string,
  onChange: (payload: { eventType: 'INSERT' | 'DELETE' | 'UPDATE' }) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`table_members:${tableId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'table_members', filter: `table_id=eq.${tableId}` },
      (payload) => {
        const eventType = (payload as any).eventType as 'INSERT' | 'DELETE' | 'UPDATE';
        onChange({ eventType });
      }
    )
    .subscribe();
  return channel;
}

export function subscribeToTextMessages(
  tableId: string,
  onInsert: (payload: { eventType: 'INSERT'; text_message_id?: string }) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`text_messages:${tableId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'text_messages', filter: `table_id=eq.${tableId}` },
      (payload) => {
        onInsert({ eventType: 'INSERT', text_message_id: (payload.new as any)?.text_message_id });
      }
    )
    .subscribe();
  return channel;
}

export function subscribeToSystemMessages(
  tableId: string,
  onInsert: (payload: { eventType: 'INSERT'; system_message_id?: string }) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`system_messages:${tableId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'system_messages', filter: `table_id=eq.${tableId}` },
      (payload) => {
        onInsert({ eventType: 'INSERT', system_message_id: (payload.new as any)?.system_message_id });
      }
    )
    .subscribe();
  return channel;
}

export function subscribeToBetProposals(
  tableId: string,
  onUpdate: (payload: { eventType: 'INSERT' | 'UPDATE'; bet_id?: string }) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`bet_proposals:${tableId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'bet_proposals', filter: `table_id=eq.${tableId}` },
      (payload) => {
        onUpdate({ eventType: 'INSERT', bet_id: (payload.new as any)?.bet_id });
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'bet_proposals', filter: `table_id=eq.${tableId}` },
      (payload) => {
        onUpdate({ eventType: 'UPDATE', bet_id: (payload.new as any)?.bet_id });
      }
    )
    .subscribe();
  return channel;
}
