-- ============================================================================
-- Phase 3: Atomic RPCs + ON DELETE CASCADE
-- ============================================================================
-- 1. settle_table RPC — atomic settlement
-- 2. create_table_with_host RPC — atomic table+host creation
-- 3. accept_friend_request RPC — atomic accept+friendship creation
-- 4. ON DELETE CASCADE on critical foreign keys
-- ============================================================================


-- ============================================================================
-- 1. settle_table(p_table_id uuid, p_user_id uuid) RETURNS jsonb
-- ============================================================================
-- Validates host, checks no active/pending bets, snapshots balances,
-- settles (bust -= push, sweep -= push, push = 0), records settlement.
-- All in one transaction — either everything commits or nothing does.

CREATE OR REPLACE FUNCTION public.settle_table(p_table_id uuid, p_user_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_table       record;
  v_active_count integer;
  v_members     jsonb;
  v_snapshot    jsonb := '[]'::jsonb;
  v_member      record;
  v_settled_at  timestamptz := now();
BEGIN
  -- 1. Verify table exists and lock the row
  SELECT table_id, host_user_id
    INTO v_table
    FROM public.tables
   WHERE table_id = p_table_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table not found'
      USING ERRCODE = 'P0002';  -- no_data_found
  END IF;

  -- 2. Only the host may settle
  IF v_table.host_user_id <> p_user_id THEN
    RAISE EXCEPTION 'Only the table host can settle the table'
      USING ERRCODE = 'P0003';
  END IF;

  -- 3. No active or pending bets
  SELECT count(*)
    INTO v_active_count
    FROM public.bet_proposals
   WHERE table_id = p_table_id
     AND bet_status IN ('active'::bet_lifecycle_status, 'pending'::bet_lifecycle_status);

  IF v_active_count > 0 THEN
    RAISE EXCEPTION 'Cannot settle table: % bet(s) are still active or pending', v_active_count
      USING ERRCODE = 'P0004';
  END IF;

  -- 4. Snapshot current balances
  SELECT jsonb_agg(
    jsonb_build_object(
      'userId', tm.user_id,
      'bustBalanceBefore', tm.bust_balance,
      'pushBalanceBefore', tm.push_balance,
      'sweepBalanceBefore', tm.sweep_balance
    )
  )
    INTO v_snapshot
    FROM public.table_members tm
   WHERE tm.table_id = p_table_id;

  IF v_snapshot IS NULL THEN
    v_snapshot := '[]'::jsonb;
  END IF;

  -- 5. Settle: bust -= push, sweep -= push, push = 0
  UPDATE public.table_members tm
     SET bust_balance  = bust_balance - push_balance,
         sweep_balance = sweep_balance - push_balance,
         push_balance  = 0
   WHERE tm.table_id = p_table_id;

  -- 6. Record settlement event
  INSERT INTO public.table_settlements (table_id, settled_by, settled_at, balance_snapshot)
  VALUES (p_table_id, p_user_id, v_settled_at, v_snapshot);

  -- 7. Return result
  RETURN jsonb_build_object(
    'tableId', p_table_id,
    'settledAt', v_settled_at,
    'memberCount', jsonb_array_length(v_snapshot),
    'balances', v_snapshot
  );
END;
$function$;


-- ============================================================================
-- 2. create_table_with_host(p_table_name text, p_host_user_id uuid) RETURNS jsonb
-- ============================================================================
-- Inserts the table row and the host as the first member atomically.

CREATE OR REPLACE FUNCTION public.create_table_with_host(p_table_name text, p_host_user_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_table_id   uuid;
  v_created_at timestamptz;
BEGIN
  -- Validate
  IF p_table_name IS NULL OR length(trim(p_table_name)) < 1 THEN
    RAISE EXCEPTION 'Table name is required'
      USING ERRCODE = 'P0005';
  END IF;

  -- Insert table
  INSERT INTO public.tables (table_name, host_user_id)
  VALUES (trim(p_table_name), p_host_user_id)
  RETURNING table_id, created_at INTO v_table_id, v_created_at;

  -- Insert host as first member
  INSERT INTO public.table_members (table_id, user_id)
  VALUES (v_table_id, p_host_user_id);

  RETURN jsonb_build_object(
    'table_id', v_table_id,
    'table_name', trim(p_table_name),
    'host_user_id', p_host_user_id,
    'created_at', v_created_at
  );
END;
$function$;


-- ============================================================================
-- 3. accept_friend_request(p_request_id uuid, p_user_id uuid) RETURNS jsonb
-- ============================================================================
-- Atomically marks the friend request as 'accepted' and inserts a friends row.

CREATE OR REPLACE FUNCTION public.accept_friend_request(p_request_id uuid, p_user_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_request     record;
  v_other_user  uuid;
  v_responded   timestamptz := now();
BEGIN
  -- 1. Load and lock the request
  SELECT request_id, sender_user_id, receiver_user_id, status
    INTO v_request
    FROM public.friend_requests
   WHERE request_id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- 2. Only the receiver can accept
  IF v_request.receiver_user_id <> p_user_id THEN
    RAISE EXCEPTION 'Only the receiver can accept this request'
      USING ERRCODE = 'P0003';
  END IF;

  -- 3. Must be pending
  IF v_request.status <> 'pending'::friend_request_status THEN
    RAISE EXCEPTION 'Request is no longer pending'
      USING ERRCODE = 'P0006';
  END IF;

  -- 4. Update to accepted
  UPDATE public.friend_requests
     SET status = 'accepted'::friend_request_status,
         responded_at = v_responded
   WHERE request_id = p_request_id;

  -- 5. Insert friendship row (idempotent — skip if already friends)
  v_other_user := v_request.sender_user_id;

  INSERT INTO public.friends (user_id1, user_id2)
  VALUES (p_user_id, v_other_user)
  ON CONFLICT DO NOTHING;

  -- Also try the reverse direction in case the PK ordering matters
  INSERT INTO public.friends (user_id1, user_id2)
  VALUES (v_other_user, p_user_id)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'sender_user_id', v_request.sender_user_id,
    'receiver_user_id', v_request.receiver_user_id,
    'status', 'accepted',
    'responded_at', v_responded
  );
END;
$function$;


-- ============================================================================
-- 4. ON DELETE CASCADE on critical foreign keys
-- ============================================================================
-- Drop and re-add FKs with CASCADE behavior so deleting a parent
-- automatically cleans up child rows.

-- 4.1 bet_participations.bet_id -> bet_proposals.bet_id
ALTER TABLE public.bet_participations
  DROP CONSTRAINT IF EXISTS bet_participations_bet_id_fkey;

ALTER TABLE public.bet_participations
  ADD CONSTRAINT bet_participations_bet_id_fkey
  FOREIGN KEY (bet_id) REFERENCES public.bet_proposals (bet_id) ON DELETE CASCADE;

-- 4.2 bet_participations composite FK (bet_id, table_id) -> bet_proposals (bet_id, table_id)
ALTER TABLE public.bet_participations
  DROP CONSTRAINT IF EXISTS bet_participations_bet_table_fk;

ALTER TABLE public.bet_participations
  ADD CONSTRAINT bet_participations_bet_table_fk
  FOREIGN KEY (bet_id, table_id) REFERENCES public.bet_proposals (bet_id, table_id) ON DELETE CASCADE;

-- 4.3 messages.bet_id -> bet_proposals.bet_id
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_bet_id_fkey;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_bet_id_fkey
  FOREIGN KEY (bet_id) REFERENCES public.bet_proposals (bet_id) ON DELETE CASCADE;

-- 4.4 messages.text_message_id -> text_messages.text_message_id
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_text_message_id_fkey;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_text_message_id_fkey
  FOREIGN KEY (text_message_id) REFERENCES public.text_messages (text_message_id) ON DELETE CASCADE;

-- 4.5 messages.system_message_id -> system_messages.system_message_id
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_system_message_id_fkey;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_system_message_id_fkey
  FOREIGN KEY (system_message_id) REFERENCES public.system_messages (system_message_id) ON DELETE CASCADE;

-- 4.6 table_members.table_id -> tables.table_id
ALTER TABLE public.table_members
  DROP CONSTRAINT IF EXISTS table_members_table_id_fkey;

ALTER TABLE public.table_members
  ADD CONSTRAINT table_members_table_id_fkey
  FOREIGN KEY (table_id) REFERENCES public.tables (table_id) ON DELETE CASCADE;
