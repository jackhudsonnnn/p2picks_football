import { supabase } from './supabaseClient';

// Create a new private table and add the creator as a member
export async function createPrivateTable(tableName: string, hostUserId: string) {
  const { data: table, error } = await supabase
    .from('private_tables')
    .insert([{ table_name: tableName, host_user_id: hostUserId }])
    .select()
    .single();
  if (error) throw error;

  // Add host as first member
  await supabase.from('table_members').insert([
    { table_id: table.table_id, user_id: hostUserId }
  ]);
  return table;
}

// Fetch all private tables for the current user (where user is a member)
export async function getUserPrivateTables(userId: string) {
  const { data, error } = await supabase
    .from('table_members')
    .select('table_id, private_tables(*)')
    .eq('user_id', userId);
  if (error) throw error;
  return data.map((row: any) => row.private_tables);
}

// Fetch a private table by ID (with members)
export async function getPrivateTable(tableId: string) {
  const { data: table, error } = await supabase
    .from('private_tables')
    .select('*, table_members(*, users(*))')
    .eq('table_id', tableId)
    .single();
  if (error) throw error;
  // Ensure table_members is always an array
  if (table && !table.table_members) {
    table.table_members = [];
  }
  return table;
}

// Add a member to a table (should check friendship before calling this)
export async function addTableMember(tableId: string, userId: string) {
  const { error } = await supabase
    .from('table_members')
    .insert([{ table_id: tableId, user_id: userId }]);
  if (error) throw error;
}

// Remove a member from a table
export async function removeTableMember(tableId: string, userId: string) {
  const { error } = await supabase
    .from('table_members')
    .delete()
    .eq('table_id', tableId)
    .eq('user_id', userId);
  if (error) throw error;
}

// Fetch chat feed for a table (joins feed_items, text_messages, system_messages, bet_proposals, users)
export async function getTableFeed(tableId: string) {
  const { data, error } = await supabase
    .from('feed_items')
    .select(`
      feed_item_id,
      item_type,
      item_created_at,
      text_message_id,
      system_message_id,
      bet_proposal_id,
      text_messages:text_message_id (text_message_id, user_id, message_text, posted_at, users:user_id (username)),
      system_messages:system_message_id (system_message_id, message_text, generated_at),
      bet_proposal:bet_proposal_id (
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
        winning_condition,
  winning_choice,
  resolution_time,
        total_pot,
        users:proposer_user_id (username),
        bet_mode_best_of_best!bet_mode_best_of_best_bet_id_fkey (player1_id, player1_name, player2_id, player2_name, stat, settle_at),
        bet_mode_one_leg_spread!bet_mode_one_leg_spread_bet_id_fkey (bet_id)
      )
    `)
    .eq('table_id', tableId)
    .order('item_created_at', { ascending: true });
  if (error) throw error;
  return data;
}

// Send a user chat message (text_message + feed_item)
export async function sendTextMessage(tableId: string, userId: string, messageText: string) {
  // 1. Insert into text_messages
  const { data: txtMsg, error: msgError } = await supabase
    .from('text_messages')
    .insert([{ user_id: userId, message_text: messageText }])
    .select()
    .single();
  if (msgError) throw msgError;
  // 2. Insert into feed_items
  const { error: feedError } = await supabase
    .from('feed_items')
    .insert([{
      table_id: tableId,
      item_type: 'text_message',
      text_message_id: txtMsg.text_message_id,
      item_created_at: txtMsg.posted_at
    }]);
  if (feedError) throw feedError;
  return txtMsg;
}

// Send a system notification (system_message + feed_item)
export async function sendSystemNotification(tableId: string, messageText: string) {
  // 1. Insert into system_messages
  const { data: sysMsg, error: sysError } = await supabase
    .from('system_messages')
  .insert([{ message_text: messageText }])
    .select()
    .single();
  if (sysError) throw sysError;
  // 2. Insert into feed_items
  const { error: feedError } = await supabase
    .from('feed_items')
    .insert([{
      table_id: tableId,
      item_type: 'system_message',
      system_message_id: sysMsg.system_message_id,
      item_created_at: sysMsg.generated_at
    }]);
  if (feedError) throw feedError;
  return sysMsg;
}
