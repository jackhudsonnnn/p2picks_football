-- ============================================================================
-- MIGRATION: Schema & Constraint Hardening (Phase 7)
-- Date: 2026-02-25
--
-- Changes:
--   1. New composite indexes
--        bet_proposals(table_id, bet_status)
--        friend_requests(sender_user_id, status)
--        friend_requests(receiver_user_id, status)
--      (bet_participations and messages indexes already present — skipped)
--   2. New check constraints
--        bet_proposals.wager_amount > 0
--        friend_requests.sender_user_id <> receiver_user_id
--        text_messages.length(message_text) <= 1000
--      (table_members and bet_participations unique constraints already present)
--   3. Drop erroneous DEFAULT gen_random_uuid() from FK columns
--        friends.user_id1, friends.user_id2
--        table_members.table_id, table_members.user_id
--   4. Case-insensitive username uniqueness index
--        CREATE UNIQUE INDEX idx_users_username_lower ON users (lower(username))
--   5. Timestamp consistency — rewrite messages_sync_from_bet_proposals and
--      touch_table_last_activity to use now() instead of timezone('utc', now()).
--      Both are functionally identical on a UTC-configured Supabase instance,
--      but now() is the conventional form used by every other function in the
--      codebase.
-- ============================================================================


-- ============================================================================
-- 1. MISSING COMPOSITE INDEXES
-- ============================================================================

-- 1a. bet_proposals: table_id + bet_status
--     Used by transition_bet_to_pending, the lifecycle service (active bets
--     per table), and RLS SELECT policy "Allow members to view bet proposals".
CREATE INDEX IF NOT EXISTS idx_bet_proposals_table_id_status
  ON public.bet_proposals (table_id, bet_status);

-- 1b. friend_requests: sender lookup by status (e.g. "my pending requests")
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender_status
  ON public.friend_requests (sender_user_id, status);

-- 1c. friend_requests: receiver lookup by status (e.g. "incoming requests")
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver_status
  ON public.friend_requests (receiver_user_id, status);


-- ============================================================================
-- 2. MISSING CHECK CONSTRAINTS
-- ============================================================================

-- 2a. wager_amount must be positive — a zero or negative wager has no meaning
--     in the payout model and would cause division-by-zero / negative pot bugs.
ALTER TABLE public.bet_proposals
  ADD CONSTRAINT bet_proposals_wager_positive
  CHECK (wager_amount > 0);

-- 2b. friend_requests: sender cannot friend themselves.
--     The friends table already has check_different_users; mirror it here so
--     the constraint is enforced at insert time before any trigger fires.
ALTER TABLE public.friend_requests
  ADD CONSTRAINT friend_requests_no_self_request
  CHECK (sender_user_id <> receiver_user_id);

-- 2c. text_messages: cap message length to prevent oversized payloads.
ALTER TABLE public.text_messages
  ADD CONSTRAINT text_messages_length_limit
  CHECK (length(message_text) <= 1000);


-- ============================================================================
-- 3. REMOVE ERRONEOUS DEFAULT gen_random_uuid() FROM FK COLUMNS
--
--    These columns are foreign keys — their values must reference an existing
--    row.  Defaulting to a random UUID means a mis-coded INSERT that omits
--    these columns silently inserts a dangling UUID that will always fail the
--    FK constraint.  The error message ("FK violation") is far less helpful
--    than "NOT NULL violation", and it masks the real bug.
-- ============================================================================

-- 3a. friends — both columns are part of the composite PK and are FKs to users
ALTER TABLE public.friends
  ALTER COLUMN user_id1 DROP DEFAULT,
  ALTER COLUMN user_id2 DROP DEFAULT;

-- 3b. table_members — table_id and user_id are FKs; member_id keeps its UUID default
ALTER TABLE public.table_members
  ALTER COLUMN table_id DROP DEFAULT,
  ALTER COLUMN user_id  DROP DEFAULT;


-- ============================================================================
-- 4. CASE-INSENSITIVE USERNAME UNIQUENESS INDEX
--
--    The existing users.username UNIQUE constraint is case-sensitive, so
--    "Alice" and "alice" are treated as distinct usernames.  The server's
--    updateUsername handler already uses .ilike() for the uniqueness check,
--    but the DB has no index to back that query efficiently and no constraint
--    to prevent a race between two concurrent inserts of "alice"/"Alice".
--
--    A partial unique index on lower(username) WHERE username IS NOT NULL
--    enforces case-insensitive uniqueness at the DB level and lets
--    isUsernameTaken on the client (and .ilike() on the server) use it.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower
  ON public.users (lower(username))
  WHERE username IS NOT NULL;


-- ============================================================================
-- 5. TIMESTAMP CONSISTENCY
--    Replace timezone('utc', now()) with now() in two trigger functions.
--    On Supabase (UTC-configured PostgreSQL) these are identical, but now()
--    is the convention used throughout the rest of the codebase.
-- ============================================================================

-- 5a. messages_sync_from_bet_proposals
CREATE OR REPLACE FUNCTION public.messages_sync_from_bet_proposals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.messages (table_id, message_type, bet_id, posted_at, created_at)
  values (
    new.table_id,
    'bet_proposal',
    new.bet_id,
    coalesce(new.proposal_time, now()),
    coalesce(new.proposal_time, now())
  )
  on conflict (bet_id) do update
    set posted_at = excluded.posted_at,
        table_id  = excluded.table_id;
  return new;
end;
$function$;

-- 5b. touch_table_last_activity
CREATE OR REPLACE FUNCTION public.touch_table_last_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.table_id is not null then
    update public.tables
       set last_activity_at = now()
     where table_id = new.table_id;
  end if;
  return new;
end;
$function$;
