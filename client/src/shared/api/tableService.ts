// Moved from src/entities/table/service.ts
import { supabase } from '@shared/api/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { ChatMessage } from '@shared/types/chat';
import { formatTimeOfDay } from '@shared/utils/dateTime';
import { fetchModeConfigs } from '@shared/api/modeConfig';
import { normalizeToHundredth } from '@shared/utils/number';

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

interface SettlementMemberRecord {
  user_id: string;
  username: string;
  balance: number;
}

export interface TableSettlementResult {
  summary: string;
  messageId: string;
  generatedAt: string;
}

function formatPointsDisplay(value: number): string {
  const normalized = normalizeToHundredth(value);
  if (normalized === 0) {
    return '0 points';
  }
  const abs = Math.abs(normalized);
  const formatted = Number.isInteger(abs) ? abs.toFixed(0) : abs.toFixed(2);
  const sign = normalized > 0 ? '+' : '-';
  return `${sign}${formatted} points`;
}

function buildSettlementSummary(
  tableName: string | null,
  host: SettlementMemberRecord,
  others: SettlementMemberRecord[]
): string {
  const winners = others
    .filter((member) => member.balance > 0)
    .sort((a, b) => b.balance - a.balance);
  const losers = others
    .filter((member) => member.balance < 0)
    .sort((a, b) => a.balance - b.balance);
  const neutrals = others.filter((member) => member.balance === 0);

  const lines: string[] = [];
  lines.push('Table Settlement Summary');
  if (tableName) {
    lines.push(`Table: ${tableName}`);
  }
  lines.push(`Host: ${host.username}: ${formatPointsDisplay(host.balance)}`);
  lines.push('');

  lines.push('Winners (To Receive from Host):');
  if (winners.length) {
    winners.forEach((member) => {
      lines.push(`- ${member.username}: ${formatPointsDisplay(member.balance)}`);
    });
  } else {
    lines.push('- None');
  }
  lines.push('');

  lines.push('Losers (To Pay Host):');
  if (losers.length) {
    losers.forEach((member) => {
      lines.push(`- ${member.username}: ${formatPointsDisplay(member.balance)}`);
    });
  } else {
    lines.push('- None');
  }

  if (neutrals.length) {
    lines.push('');
    lines.push('Members With No Balance Change:');
    neutrals.forEach((member) => {
      lines.push(`- ${member.username}: 0 points`);
    });
  }

  return lines.join('\n');
}

export async function settleTable(tableId: string): Promise<TableSettlementResult> {
  if (!tableId) {
    throw new Error('tableId is required to settle a table');
  }

  const { data: tableRecord, error: tableError } = await supabase
    .from('tables')
    .select('table_id, table_name, host_user_id, table_members(user_id, balance, users(username))')
    .eq('table_id', tableId)
    .single();

  if (tableError) throw tableError;
  if (!tableRecord) throw new Error('Table not found');

  const members: SettlementMemberRecord[] = (tableRecord.table_members || []).map((member: any) => ({
    user_id: member.user_id,
    username: member.users?.username ?? member.user_id,
    balance: normalizeToHundredth(member.balance ?? 0),
  }));

  if (!members.length) {
    throw new Error('Cannot settle a table with no members');
  }

  const hostMember = members.find((member) => member.user_id === tableRecord.host_user_id);
  if (!hostMember) {
    throw new Error('Host record missing from table members');
  }

  const nonHostMembers = members.filter((member) => member.user_id !== hostMember.user_id);
  const summary = buildSettlementSummary(tableRecord.table_name ?? null, hostMember, nonHostMembers);

  const originalBalances = members.map((member) => ({
    user_id: member.user_id,
    balance: member.balance,
  }));

  const { error: balanceError } = await supabase
    .from('table_members')
    .update({ balance: 0 })
    .eq('table_id', tableId);

  if (balanceError) throw balanceError;

  const { data: messageData, error: messageError } = await supabase
    .from('system_messages')
    .insert([{ table_id: tableId, message_text: summary }])
    .select('system_message_id, generated_at')
    .single();

  if (messageError) {
    await Promise.all(
      originalBalances.map(async ({ user_id, balance }) => {
        const { error: rollbackError } = await supabase
          .from('table_members')
          .update({ balance })
          .eq('table_id', tableId)
          .eq('user_id', user_id);
        if (rollbackError) {
          console.error('[settleTable] Failed to rollback balance for user', user_id, rollbackError);
        }
      })
    );
    throw messageError;
  }

  return {
    summary,
    messageId: messageData?.system_message_id ?? '',
    generatedAt: messageData?.generated_at ?? new Date().toISOString(),
  };
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
        users:proposer_user_id (username)
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

  const betRows = betData ?? [];
  const betIds = Array.from(new Set(betRows.map((b: any) => b.bet_id).filter(Boolean))) as string[];
  if (betIds.length) {
    try {
      const configs = await fetchModeConfigs(betIds);
      betRows.forEach((bet: any) => {
        const record = configs[bet.bet_id];
        if (record && (!bet.mode_key || record.mode_key === bet.mode_key)) {
          (bet as any).mode_config = record.data;
        }
      });
    } catch (cfgErr) {
      console.warn('[getTableFeed] failed to hydrate mode config', cfgErr);
    }
  }

  betRows.forEach((bet: any) => {
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
