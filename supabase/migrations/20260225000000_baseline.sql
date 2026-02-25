-- ============================================================================
-- BASELINE MIGRATION
-- Generated from production schema on 2026-02-25
-- This captures the entire existing database state as the starting point
-- for version-controlled migrations.
--
-- NOTE: This migration is intended to be marked as "applied" on production
-- via `supabase migration repair --status applied 20260225000000`
-- since the production database already has all these objects.
-- ============================================================================

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.bet_lifecycle_status AS ENUM ('active', 'pending', 'resolved', 'washed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.friend_request_status AS ENUM ('pending', 'accepted', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.league AS ENUM ('NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'U2Pick');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.message_type AS ENUM ('chat', 'system', 'bet_proposal');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 2. TABLES
-- ============================================================================

-- 2.1 users
CREATE TABLE IF NOT EXISTS public.users (
  user_id    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username   text        UNIQUE,
  email      text        NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2.2 tables (poker-style groups)
CREATE TABLE IF NOT EXISTS public.tables (
  table_id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name       text        NOT NULL CHECK (length(table_name) <= 10),
  host_user_id     uuid        NOT NULL REFERENCES public.users (user_id),
  created_at       timestamptz          DEFAULT now(),
  last_activity_at timestamptz          DEFAULT timezone('utc', now()),
  CONSTRAINT tables_table_id_key UNIQUE (table_id)
);

-- 2.3 table_members
CREATE TABLE IF NOT EXISTS public.table_members (
  member_id     uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_id      uuid          NOT NULL DEFAULT gen_random_uuid() REFERENCES public.tables (table_id),
  user_id       uuid          NOT NULL DEFAULT gen_random_uuid() REFERENCES public.users (user_id),
  joined_at     timestamptz            DEFAULT now(),
  bust_balance  numeric       NOT NULL DEFAULT 0 CHECK (((bust_balance)::numeric % 0.01) = 0),
  push_balance  numeric       NOT NULL DEFAULT 0,
  sweep_balance numeric       NOT NULL DEFAULT 0,
  CONSTRAINT unique_table_user UNIQUE (table_id, user_id)
);

-- 2.4 bet_proposals
CREATE TABLE IF NOT EXISTS public.bet_proposals (
  bet_id             uuid                   NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_id           uuid                   NOT NULL REFERENCES public.tables (table_id),
  proposer_user_id   uuid                   NOT NULL REFERENCES public.users (user_id),
  wager_amount       numeric                NOT NULL CHECK ((wager_amount % 0.01) = 0),
  time_limit_seconds integer                NOT NULL CHECK (time_limit_seconds >= 15 AND time_limit_seconds <= 120),
  proposal_time      timestamptz            NOT NULL DEFAULT now(),
  bet_status         bet_lifecycle_status   NOT NULL DEFAULT 'active'::bet_lifecycle_status,
  resolution_time    timestamptz,
  mode_key           text                   NOT NULL,
  close_time         timestamptz            NOT NULL,
  description        text                   NOT NULL,
  winning_choice     text,
  league_game_id     text                   NOT NULL,
  league             league                 NOT NULL DEFAULT 'U2Pick'::league,
  CONSTRAINT bet_proposals_bet_id_key   UNIQUE (bet_id),
  CONSTRAINT bet_proposals_bet_table_uniq UNIQUE (bet_id, table_id)
);

-- 2.5 bet_participations
CREATE TABLE IF NOT EXISTS public.bet_participations (
  participation_id uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bet_id           uuid        NOT NULL REFERENCES public.bet_proposals (bet_id),
  user_id          uuid        NOT NULL REFERENCES public.users (user_id),
  table_id         uuid        NOT NULL REFERENCES public.tables (table_id),
  user_guess       text        NOT NULL DEFAULT 'No Entry'::text,
  participation_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bet_participations_participation_id_key UNIQUE (participation_id),
  CONSTRAINT bet_participations_bet_id_user_id_key   UNIQUE (bet_id, user_id),
  CONSTRAINT bet_participations_one_per_user          UNIQUE (bet_id, user_id)
);

-- composite FK: (bet_id, table_id) -> bet_proposals (bet_id, table_id)
ALTER TABLE public.bet_participations
  ADD CONSTRAINT bet_participations_bet_table_fk
  FOREIGN KEY (bet_id, table_id) REFERENCES public.bet_proposals (bet_id, table_id);

-- 2.6 friend_requests
CREATE TABLE IF NOT EXISTS public.friend_requests (
  request_id       uuid                   NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_user_id   uuid                   NOT NULL REFERENCES public.users (user_id),
  receiver_user_id uuid                   NOT NULL REFERENCES public.users (user_id),
  created_at       timestamptz            NOT NULL DEFAULT now(),
  responded_at     timestamptz,
  status           friend_request_status  NOT NULL DEFAULT 'pending'::friend_request_status
);

-- 2.7 friends
CREATE TABLE IF NOT EXISTS public.friends (
  user_id1   uuid        NOT NULL DEFAULT gen_random_uuid() REFERENCES public.users (user_id),
  user_id2   uuid        NOT NULL DEFAULT gen_random_uuid() REFERENCES public.users (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id1, user_id2),
  CONSTRAINT check_different_users CHECK (user_id1 <> user_id2)
);

-- 2.8 system_messages
CREATE TABLE IF NOT EXISTS public.system_messages (
  system_message_id uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_text      text        NOT NULL,
  generated_at      timestamptz          DEFAULT now(),
  table_id          uuid        NOT NULL REFERENCES public.tables (table_id)
);

-- 2.9 text_messages
CREATE TABLE IF NOT EXISTS public.text_messages (
  text_message_id uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid        NOT NULL REFERENCES public.users (user_id),
  message_text    text        NOT NULL,
  posted_at       timestamptz          DEFAULT now(),
  table_id        uuid        NOT NULL REFERENCES public.tables (table_id),
  CONSTRAINT text_messages_text_message_id_key UNIQUE (text_message_id)
);

-- 2.10 messages (unified message feed — one row per chat, system msg, or bet)
CREATE TABLE IF NOT EXISTS public.messages (
  message_id        uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_id          uuid         NOT NULL REFERENCES public.tables (table_id),
  message_type      message_type NOT NULL DEFAULT 'chat'::message_type,
  text_message_id   uuid         UNIQUE REFERENCES public.text_messages (text_message_id),
  system_message_id uuid         UNIQUE REFERENCES public.system_messages (system_message_id),
  bet_id            uuid         UNIQUE REFERENCES public.bet_proposals (bet_id),
  posted_at         timestamptz  NOT NULL DEFAULT timezone('utc', now()),
  created_at        timestamptz  NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT messages_type_match CHECK (
    (message_type = 'chat'::message_type         AND text_message_id   IS NOT NULL AND system_message_id IS NULL AND bet_id IS NULL) OR
    (message_type = 'system'::message_type        AND system_message_id IS NOT NULL AND text_message_id   IS NULL AND bet_id IS NULL) OR
    (message_type = 'bet_proposal'::message_type  AND bet_id            IS NOT NULL AND text_message_id   IS NULL AND system_message_id IS NULL)
  )
);

-- 2.11 resolution_history
CREATE TABLE IF NOT EXISTS public.resolution_history (
  resolution_history_id uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bet_id                uuid        NOT NULL REFERENCES public.bet_proposals (bet_id),
  event_type            text        NOT NULL,
  payload               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);


-- ============================================================================
-- 3. FUNCTIONS
-- ============================================================================

-- 3.1 handle_new_user (auth trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.users (user_id, email)
  values (new.id, new.email);
  return new;
end;
$function$;

-- 3.2 is_table_member
CREATE OR REPLACE FUNCTION public.is_table_member(p_table_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM table_members tm
        WHERE tm.table_id = p_table_id AND tm.user_id = p_user_id
    );
END;
$function$;

-- 3.3 is_user_member_of_table
CREATE OR REPLACE FUNCTION public.is_user_member_of_table(p_table_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.table_members tm
    WHERE tm.table_id = p_table_id AND tm.user_id = p_user_id
  );
END;
$function$;

-- 3.4 is_user_host_of_table
CREATE OR REPLACE FUNCTION public.is_user_host_of_table(p_table_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.tables pt
    WHERE pt.table_id = p_table_id AND pt.host_user_id = p_user_id
  );
END;
$function$;

-- 3.5 get_table_host_user_id
CREATE OR REPLACE FUNCTION public.get_table_host_user_id(p_table_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_host_user_id uuid;
BEGIN
    SELECT host_user_id INTO v_host_user_id
    FROM tables pt
    WHERE pt.table_id = p_table_id;
    RETURN v_host_user_id;
END;
$function$;

-- 3.6 is_bet_open
CREATE OR REPLACE FUNCTION public.is_bet_open(p_bet_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (
    select 1
    from public.bet_proposals bp
    where bp.bet_id = p_bet_id
      and bp.bet_status = 'active'::bet_lifecycle_status
      and now() < bp.close_time
  );
$function$;

-- 3.7 set_bet_close_time
CREATE OR REPLACE FUNCTION public.set_bet_close_time()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.close_time := NEW.proposal_time + make_interval(secs => NEW.time_limit_seconds::double precision);
  RETURN NEW;
END;
$function$;

-- 3.8 set_bet_resolved_on_winning_choice
CREATE OR REPLACE FUNCTION public.set_bet_resolved_on_winning_choice()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.winning_choice IS NOT NULL
     AND (OLD.winning_choice IS DISTINCT FROM NEW.winning_choice OR OLD.winning_choice IS NULL) THEN
    NEW.bet_status := 'resolved'::bet_lifecycle_status;
    IF NEW.resolution_time IS NULL THEN
      NEW.resolution_time := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3.9 enforce_immutable_bet_participation_fields
CREATE OR REPLACE FUNCTION public.enforce_immutable_bet_participation_fields()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.bet_id <> OLD.bet_id OR NEW.table_id <> OLD.table_id OR NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'bet_participations immutable fields (bet_id, table_id, user_id) cannot be modified';
  END IF;
  RETURN NEW;
END;
$function$;

-- 3.10 resolution_enforce_no_winner_wash
CREATE OR REPLACE FUNCTION public.resolution_enforce_no_winner_wash()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_winners INTEGER;
BEGIN
  IF NEW.bet_status = 'resolved'::bet_lifecycle_status AND NEW.winning_choice IS NOT NULL THEN
    SELECT COUNT(*) INTO v_winners
    FROM public.bet_participations bp
    WHERE bp.bet_id = NEW.bet_id
      AND bp.user_guess = NEW.winning_choice;

    IF COALESCE(v_winners, 0) = 0 THEN
      NEW.bet_status := 'washed'::bet_lifecycle_status;
      NEW.winning_choice := NULL;
      NEW.resolution_time := now();

      INSERT INTO public.resolution_history(bet_id, event_type, payload)
      VALUES (NEW.bet_id, 'washed', jsonb_build_object('reason','Nobody chose the correct choice'));
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3.11 transition_bet_to_pending
CREATE OR REPLACE FUNCTION public.transition_bet_to_pending(p_bet_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bet record;
  v_total_non_no_entry integer;
  v_distinct_non_no_entry integer;
  v_table_id uuid;
  v_wager numeric(12,2);
  v_role text;
  v_participant record;
  v_participant_count integer;
  v_choice_count integer;
  v_loser_pot numeric(12,2);
  v_payout_share numeric(12,2);
BEGIN
  v_role := coalesce(current_setting('request.jwt.claim.role', true), current_user);
  IF v_role NOT IN ('service_role', 'postgres') THEN
    RETURN 'forbidden';
  END IF;

  IF p_bet_id IS NULL THEN
    RETURN 'invalid_argument';
  END IF;

  SELECT * INTO v_bet
  FROM public.bet_proposals
  WHERE bet_id = p_bet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF v_bet.bet_status <> 'active'::bet_lifecycle_status THEN
    RETURN 'not_active';
  END IF;

  IF v_bet.close_time IS NULL THEN
    RETURN 'no_close_time';
  END IF;

  IF now() < v_bet.close_time THEN
    RETURN 'too_early';
  END IF;

  SELECT
    count(*) FILTER (WHERE user_guess IS NOT NULL AND user_guess <> 'No Entry') AS total_non_no_entry,
    count(DISTINCT user_guess) FILTER (WHERE user_guess IS NOT NULL AND user_guess <> 'No Entry') AS distinct_non_no_entry
  INTO v_total_non_no_entry, v_distinct_non_no_entry
  FROM public.bet_participations
  WHERE bet_id = v_bet.bet_id;

  IF v_total_non_no_entry = 0 OR v_distinct_non_no_entry = 1 THEN
    UPDATE public.bet_proposals
       SET bet_status = 'washed'::bet_lifecycle_status,
           resolution_time = now()
     WHERE bet_id = v_bet.bet_id
       AND bet_status = 'active'::bet_lifecycle_status;
    RETURN 'washed_insufficient_participation';
  END IF;

  UPDATE public.bet_proposals
     SET bet_status = 'pending'::bet_lifecycle_status
   WHERE bet_id = v_bet.bet_id
     AND bet_status = 'active'::bet_lifecycle_status
   RETURNING table_id, round(wager_amount::numeric, 2)
    INTO v_table_id, v_wager;

  IF NOT FOUND THEN
    RETURN 'not_active';
  END IF;

  v_participant_count := v_total_non_no_entry;

  FOR v_participant IN
    SELECT DISTINCT bp.user_id, bp.user_guess
      FROM public.bet_participations bp
     WHERE bp.bet_id = v_bet.bet_id
       AND bp.user_guess IS NOT NULL
       AND bp.user_guess <> 'No Entry'
  LOOP
    SELECT count(DISTINCT user_id)
      INTO v_choice_count
      FROM public.bet_participations
     WHERE bet_id = v_bet.bet_id
       AND user_guess = v_participant.user_guess;

    v_loser_pot := v_wager * (v_participant_count - v_choice_count);
    v_payout_share := v_wager + trunc(v_loser_pot / v_choice_count, 2);

    UPDATE public.table_members tm
       SET bust_balance  = bust_balance - v_wager,
           sweep_balance = sweep_balance + (v_payout_share - v_wager)
     WHERE tm.table_id = v_table_id
       AND tm.user_id = v_participant.user_id;
  END LOOP;

  RETURN 'pending';
END;
$function$;

-- 3.12 set_bets_pending (batch processor)
CREATE OR REPLACE FUNCTION public.set_bets_pending()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT bp.bet_id
      FROM public.bet_proposals bp
     WHERE bp.bet_status = 'active'::bet_lifecycle_status
       AND bp.close_time IS NOT NULL
       AND now() >= bp.close_time
  LOOP
    PERFORM public.transition_bet_to_pending(rec.bet_id);
  END LOOP;
END;
$function$;

-- 3.13 apply_bet_payouts
CREATE OR REPLACE FUNCTION public.apply_bet_payouts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_winner_count             integer := 0;
  v_loser_count              integer := 0;
  v_wager_each               numeric(12,2) := 0;
  v_loser_pot                numeric(18,2) := 0;
  v_base_share               numeric(18,2) := 0;
  v_total_per_winner         numeric(18,2) := 0;
  v_remainder_amt            numeric(18,2) := 0;
  v_remainder_cents          integer := 0;
  v_extra_cents_per_winner   integer := 0;
  v_extra_cents_mod          integer := 0;
  v_participant_count        integer := 0;
  v_participant record;
  v_choice_count integer;
  v_potential_payout numeric(18,2);
  v_potential_loser_pot numeric(18,2);
BEGIN
  IF NEW.bet_status = 'resolved'::bet_lifecycle_status
     AND OLD.bet_status IS DISTINCT FROM 'resolved'::bet_lifecycle_status
     AND NEW.winning_choice IS NOT NULL THEN

    SELECT
      COUNT(DISTINCT CASE WHEN bp.user_guess = NEW.winning_choice THEN bp.user_id END),
      COUNT(DISTINCT CASE WHEN bp.user_guess IS NOT NULL AND bp.user_guess <> 'No Entry' AND bp.user_guess <> NEW.winning_choice THEN bp.user_id END),
      COUNT(DISTINCT CASE WHEN bp.user_guess IS NOT NULL AND bp.user_guess <> 'No Entry' THEN bp.user_id END)
    INTO v_winner_count, v_loser_count, v_participant_count
    FROM public.bet_participations bp
    WHERE bp.bet_id = NEW.bet_id;

    IF v_winner_count = 0 THEN
      RETURN NEW;
    END IF;

    v_wager_each := COALESCE(round(NEW.wager_amount::numeric, 2), 0);
    v_loser_pot  := v_wager_each * v_loser_count;
    v_base_share := trunc(v_loser_pot / v_winner_count, 2);
    v_total_per_winner := v_wager_each + v_base_share;

    v_remainder_amt   := GREATEST(v_loser_pot - (v_base_share * v_winner_count), 0);
    v_remainder_cents := ROUND(v_remainder_amt * 100)::integer;
    v_extra_cents_per_winner := CASE WHEN v_winner_count > 0 THEN v_remainder_cents / v_winner_count ELSE 0 END;
    v_extra_cents_mod := CASE WHEN v_winner_count > 0 THEN v_remainder_cents % v_winner_count ELSE 0 END;

    IF v_total_per_winner <> 0 OR v_remainder_cents > 0 THEN
      WITH unique_winners AS (
        SELECT DISTINCT bp.user_id
        FROM public.bet_participations bp
        WHERE bp.bet_id = NEW.bet_id
          AND bp.user_guess = NEW.winning_choice
      ),
      ranked_winners AS (
        SELECT uw.user_id,
               (ROW_NUMBER() OVER (ORDER BY random()) - 1)::integer AS rn
        FROM unique_winners uw
      )
      UPDATE public.table_members tm
      SET bust_balance = bust_balance
        + v_total_per_winner
        + (v_extra_cents_per_winner::numeric / 100)
        + CASE WHEN rw.rn < v_extra_cents_mod THEN 0.01 ELSE 0 END,
          push_balance = push_balance
        + (v_total_per_winner - v_wager_each)
        + (v_extra_cents_per_winner::numeric / 100)
        + CASE WHEN rw.rn < v_extra_cents_mod THEN 0.01 ELSE 0 END,
          sweep_balance = sweep_balance
        - CASE WHEN rw.rn < v_extra_cents_mod THEN 0 ELSE 0.01 END
      FROM ranked_winners rw
      WHERE tm.table_id = NEW.table_id
        AND tm.user_id = rw.user_id;
    END IF;

    FOR v_participant IN
      SELECT DISTINCT bp.user_id, bp.user_guess
        FROM public.bet_participations bp
       WHERE bp.bet_id = NEW.bet_id
         AND bp.user_guess IS NOT NULL
         AND bp.user_guess <> 'No Entry'
    LOOP
      SELECT count(DISTINCT user_id)
        INTO v_choice_count
        FROM public.bet_participations
       WHERE bet_id = NEW.bet_id
         AND user_guess = v_participant.user_guess;

      v_potential_loser_pot := v_wager_each * (v_participant_count - v_choice_count);
      v_potential_payout := v_wager_each + trunc(v_potential_loser_pot / NULLIF(v_choice_count, 0), 2);

      IF v_participant.user_guess = NEW.winning_choice THEN
        NULL;
      ELSE
        UPDATE public.table_members tm
        SET push_balance  = push_balance - v_wager_each,
            sweep_balance = sweep_balance - COALESCE(v_potential_payout, 0)
        WHERE tm.table_id = NEW.table_id
          AND tm.user_id = v_participant.user_id;
      END IF;
    END LOOP;

    INSERT INTO public.resolution_history (bet_id, event_type, payload)
    VALUES (
      NEW.bet_id,
      'payout',
      jsonb_build_object(
        'winners',         v_winner_count,
        'losers',          v_loser_count,
        'wager',           v_wager_each,
        'losers_pot',      v_loser_pot,
        'base_share',      v_base_share,
        'remainder',       v_remainder_amt,
        'remainder_cents', v_remainder_cents
      )
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- 3.14 refund_bet_points_on_wash
CREATE OR REPLACE FUNCTION public.refund_bet_points_on_wash()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_wager_each numeric(12,2) := COALESCE(round(NEW.wager_amount::numeric, 2), 0);
  v_participant record;
  v_participant_count integer;
  v_choice_count integer;
  v_loser_pot numeric(12,2);
  v_payout_share numeric(12,2);
BEGIN
  SELECT count(DISTINCT user_id)
    INTO v_participant_count
    FROM public.bet_participations
   WHERE bet_id = NEW.bet_id
     AND user_guess IS NOT NULL
     AND user_guess <> 'No Entry';

  FOR v_participant IN
    SELECT DISTINCT bp.user_id, bp.user_guess
      FROM public.bet_participations bp
     WHERE bp.bet_id = NEW.bet_id
       AND bp.user_guess IS NOT NULL
       AND bp.user_guess <> 'No Entry'
  LOOP
    SELECT count(DISTINCT user_id)
      INTO v_choice_count
      FROM public.bet_participations
     WHERE bet_id = NEW.bet_id
       AND user_guess = v_participant.user_guess;

    IF v_choice_count = 0 THEN
      INSERT INTO public.resolution_history (bet_id, event_type, payload)
      VALUES (
        NEW.bet_id,
        'wash_refund_error',
        jsonb_build_object(
          'error', 'division_by_zero',
          'user_id', v_participant.user_id,
          'user_guess', v_participant.user_guess
        )
      );
      CONTINUE;
    END IF;

    v_loser_pot := v_wager_each * (v_participant_count - v_choice_count);
    v_payout_share := v_wager_each + trunc(v_loser_pot / v_choice_count, 2);

    UPDATE public.table_members tm
       SET bust_balance  = bust_balance + v_wager_each,
           sweep_balance = sweep_balance - v_payout_share + v_wager_each
     WHERE tm.table_id = NEW.table_id
       AND tm.user_id = v_participant.user_id;
  END LOOP;

  INSERT INTO public.resolution_history (bet_id, event_type, payload)
  VALUES (
    NEW.bet_id,
    'wash_refund',
    jsonb_build_object(
      'refunded_users', v_participant_count,
      'wager', v_wager_each,
      'status_from', OLD.bet_status,
      'status_to', NEW.bet_status
    )
  );

  RETURN NEW;
END;
$function$;

-- 3.15 wash_bet_with_history
CREATE OR REPLACE FUNCTION public.wash_bet_with_history(p_bet_id uuid, p_event_type text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result     jsonb;
  v_table_id   uuid;
BEGIN
  UPDATE public.bet_proposals
  SET bet_status      = 'washed'::bet_lifecycle_status,
      winning_choice  = NULL,
      resolution_time = now()
  WHERE bet_id     = p_bet_id
    AND bet_status = 'pending'::bet_lifecycle_status
  RETURNING table_id INTO v_table_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.resolution_history (bet_id, event_type, payload)
  VALUES (p_bet_id, p_event_type, p_payload);

  v_result := jsonb_build_object(
    'bet_id',   p_bet_id,
    'table_id', v_table_id
  );

  RETURN v_result;
END;
$function$;

-- 3.16 log_bet_status_transition
CREATE OR REPLACE FUNCTION public.log_bet_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (TG_OP = 'UPDATE') AND NEW.bet_status IS DISTINCT FROM OLD.bet_status THEN
    INSERT INTO public.resolution_history (bet_id, event_type, payload)
    VALUES (NEW.bet_id, 'status_transition', jsonb_build_object('from', OLD.bet_status, 'to', NEW.bet_status));
  END IF;
  RETURN NEW;
END;
$function$;

-- 3.17 create_system_message_on_bet_status_change
CREATE OR REPLACE FUNCTION public.create_system_message_on_bet_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_table_id uuid;
  v_lines text[];
  v_total_participants integer := 0;
  v_option record;
  v_wager numeric := coalesce(NEW.wager_amount, 0);
  v_total_pot numeric;
  v_share numeric;
  v_profit numeric;
  v_odds_text text;
  v_odds_value numeric;
begin
  if (OLD.bet_status is distinct from NEW.bet_status) then
    select table_id
      into v_table_id
    from public.bet_proposals
    where bet_id = NEW.bet_id;

    if v_table_id is null then
      raise exception
        'Cannot create status change system message for bet %, table_id not found on bet_proposals',
        NEW.bet_id;
    end if;

    if (OLD.bet_status = 'active'::bet_lifecycle_status and NEW.bet_status = 'pending'::bet_lifecycle_status) then
      select count(distinct user_id)
        into v_total_participants
      from public.bet_participations
      where bet_id = NEW.bet_id
        and user_guess is not null
        and user_guess <> 'No Entry';

      v_lines := array[
        format(E'Bet #%s pending', left(NEW.bet_id::text, 8))
      ];

      for v_option in
        select user_guess as option_label,
               count(distinct user_id) as pick_count
        from public.bet_participations
        where bet_id = NEW.bet_id
          and user_guess is not null
          and user_guess <> 'No Entry'
        group by user_guess
        order by user_guess
      loop
        if v_option.pick_count > 0 and v_total_participants > 0 then
          v_total_pot := v_wager * (v_total_participants - v_option.pick_count);
          v_share := v_wager + (v_total_pot / v_option.pick_count);
          v_profit := v_share - v_wager;

          if v_option.pick_count = v_total_participants then
            v_odds_text := '--';
          else
            if v_option.pick_count > (v_total_participants / 2.0) then
              v_odds_value := -100 / ((v_total_participants - v_option.pick_count)::numeric / v_option.pick_count);
              v_odds_text := to_char(v_odds_value, 'FM9999');
            else
              v_odds_value := ((v_total_participants - v_option.pick_count)::numeric / v_option.pick_count) * 100;
              v_odds_text := to_char(v_odds_value, 'FM+9999');
            end if;
          end if;

          v_lines := array_append(v_lines, format(
            E'%s (%s):\n  %s pt payout\n  %s participant(s)',
            v_option.option_label,
            v_odds_text,
            to_char(v_share, 'FM999G999D00'),
            to_char(v_option.pick_count, 'FM9999')
          ));
        end if;
      end loop;

      if array_length(v_lines, 1) = 2 then
        v_lines[2] := v_lines[2] || E'\n\nNo eligible picks — bet will wash if this stands.';
        insert into public.system_messages (table_id, message_text, generated_at)
        values (v_table_id, array_to_string(v_lines, E'\n'), now());
      else
        insert into public.system_messages (table_id, message_text, generated_at)
        values (v_table_id, array_to_string(v_lines, E'\n\n'), now());
      end if;

    elsif (NEW.bet_status = 'resolved'::bet_lifecycle_status and OLD.bet_status is distinct from 'resolved'::bet_lifecycle_status) then
      insert into public.system_messages (table_id, message_text, generated_at)
      values (
        v_table_id,
        format(
          E'Bet #%s resolved\n\nwinning choice: \"%s\"',
          left(NEW.bet_id::text, 8),
          coalesce(NEW.winning_choice::text, 'unknown')
        ),
        now()
      );
    end if;
  end if;

  return NEW;
end;
$function$;

-- 3.18 create_system_message_on_bet_washed
CREATE OR REPLACE FUNCTION public.create_system_message_on_bet_washed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sys_id    uuid;
  v_text      text;
  v_table_id  uuid;
  v_payload   jsonb := '{}'::jsonb;
  v_reason    text;
BEGIN
  IF (OLD.bet_status IS DISTINCT FROM 'washed'::bet_lifecycle_status AND NEW.bet_status = 'washed'::bet_lifecycle_status) THEN
    SELECT table_id
      INTO v_table_id
    FROM public.bet_proposals
    WHERE bet_id = NEW.bet_id;

    IF v_table_id IS NULL THEN
      RAISE EXCEPTION 'Cannot create washed system message for bet %, table_id not found on bet_proposals', NEW.bet_id;
    END IF;

    SELECT payload
      INTO v_payload
    FROM public.resolution_history
    WHERE bet_id = NEW.bet_id
      AND event_type = 'washed'
    ORDER BY created_at DESC
    LIMIT 1;

    v_reason := COALESCE(
      v_payload->>'reason',
      v_payload->>'explanation',
      v_payload->>'wash_reason',
      v_payload->>'wash_reason_text',
      v_payload->>'outcome_detail',
      'Not enough participants'
    );

    v_text := format(E'Bet #%s washed\n\n%s', left(NEW.bet_id::text, 8), v_reason);

    INSERT INTO public.system_messages (table_id, message_text, generated_at)
    VALUES (v_table_id, v_text, now())
    RETURNING system_message_id INTO v_sys_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3.19 messages_sync_from_text_messages
CREATE OR REPLACE FUNCTION public.messages_sync_from_text_messages()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.messages (table_id, message_type, text_message_id, posted_at, created_at)
  values (new.table_id, 'chat', new.text_message_id, new.posted_at, new.posted_at)
  on conflict (text_message_id) do update
    set posted_at = excluded.posted_at,
        table_id = excluded.table_id;
  return new;
end;
$function$;

-- 3.20 messages_sync_from_system_messages
CREATE OR REPLACE FUNCTION public.messages_sync_from_system_messages()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.messages (table_id, message_type, system_message_id, posted_at, created_at)
  values (new.table_id, 'system', new.system_message_id, new.generated_at, new.generated_at)
  on conflict (system_message_id) do update
    set posted_at = excluded.posted_at,
        table_id = excluded.table_id;
  return new;
end;
$function$;

-- 3.21 messages_sync_from_bet_proposals
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
    coalesce(new.proposal_time, timezone('utc', now())),
    coalesce(new.proposal_time, timezone('utc', now()))
  )
  on conflict (bet_id) do update
    set posted_at = excluded.posted_at,
        table_id = excluded.table_id;
  return new;
end;
$function$;

-- 3.22 touch_table_last_activity
CREATE OR REPLACE FUNCTION public.touch_table_last_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.table_id is not null then
    update public.tables
       set last_activity_at = timezone('utc', now())
     where table_id = new.table_id;
  end if;
  return new;
end;
$function$;


-- ============================================================================
-- 4. TRIGGERS
-- ============================================================================

-- 4.1 Auth trigger: auto-create user row on signup
-- NOTE: This trigger is on auth.users which is managed by Supabase.
-- It may already exist. We use CREATE OR REPLACE on the function above.
-- The trigger itself must be created on auth.users:
DO $$ BEGIN
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4.2 bet_participations triggers
DO $$ BEGIN
  CREATE TRIGGER trg_enforce_immutable_bet_participation_fields
    BEFORE UPDATE ON public.bet_participations
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_immutable_bet_participation_fields();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_touch_tables_on_bet_participations
    AFTER INSERT OR UPDATE ON public.bet_participations
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_table_last_activity();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4.3 bet_proposals triggers
DO $$ BEGIN
  CREATE TRIGGER trg_set_bet_close_time
    BEFORE INSERT OR UPDATE ON public.bet_proposals
    FOR EACH ROW
    EXECUTE FUNCTION public.set_bet_close_time();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_set_bet_close_time_before_insert
    BEFORE INSERT ON public.bet_proposals
    FOR EACH ROW
    EXECUTE FUNCTION public.set_bet_close_time();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_auto_resolve_on_winning_choice
    BEFORE UPDATE ON public.bet_proposals
    FOR EACH ROW
    EXECUTE FUNCTION public.set_bet_resolved_on_winning_choice();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_enforce_resolve_no_winner_wash
    BEFORE UPDATE ON public.bet_proposals
    FOR EACH ROW
    EXECUTE FUNCTION public.resolution_enforce_no_winner_wash();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_apply_bet_payouts
    AFTER UPDATE ON public.bet_proposals
    FOR EACH ROW
    EXECUTE FUNCTION public.apply_bet_payouts();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_bet_proposals_washed_msg
    AFTER UPDATE ON public.bet_proposals
    FOR EACH ROW
    EXECUTE FUNCTION public.create_system_message_on_bet_washed();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_create_system_message_on_bet_status_change
    AFTER UPDATE ON public.bet_proposals
    FOR EACH ROW
    EXECUTE FUNCTION public.create_system_message_on_bet_status_change();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_refund_bet_points_on_wash
    AFTER UPDATE ON public.bet_proposals
    FOR EACH ROW
    WHEN (OLD.bet_status = 'pending'::bet_lifecycle_status AND NEW.bet_status = 'washed'::bet_lifecycle_status)
    EXECUTE FUNCTION public.refund_bet_points_on_wash();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_messages_from_bets
    AFTER INSERT OR UPDATE ON public.bet_proposals
    FOR EACH ROW
    EXECUTE FUNCTION public.messages_sync_from_bet_proposals();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_touch_tables_on_bet_proposals
    AFTER INSERT OR UPDATE ON public.bet_proposals
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_table_last_activity();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4.4 messages triggers
DO $$ BEGIN
  CREATE TRIGGER trg_touch_tables_on_messages
    AFTER INSERT OR UPDATE ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_table_last_activity();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4.5 system_messages triggers
DO $$ BEGIN
  CREATE TRIGGER trg_messages_from_system
    AFTER INSERT OR UPDATE ON public.system_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.messages_sync_from_system_messages();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_touch_tables_on_system_messages
    AFTER INSERT OR UPDATE ON public.system_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_table_last_activity();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4.6 table_members triggers
DO $$ BEGIN
  CREATE TRIGGER trg_touch_tables_on_table_members
    AFTER INSERT OR UPDATE OR DELETE ON public.table_members
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_table_last_activity();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4.7 text_messages triggers
DO $$ BEGIN
  CREATE TRIGGER trg_messages_from_text
    AFTER INSERT OR UPDATE ON public.text_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.messages_sync_from_text_messages();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_touch_tables_on_text_messages
    AFTER INSERT OR UPDATE ON public.text_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_table_last_activity();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================================

-- 5.1 Enable RLS on all public tables
ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bet_proposals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bet_participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friends            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.text_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resolution_history ENABLE ROW LEVEL SECURITY;

-- ── users ──
CREATE POLICY "Allow authenticated read access to usernames"
  ON public.users FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow individual read access to own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Allow users to update their own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── tables ──
CREATE POLICY "Allow authenticated insert for tables"
  ON public.tables FOR INSERT
  WITH CHECK (host_user_id = auth.uid());

CREATE POLICY "Allow host to delete their table"
  ON public.tables FOR DELETE
  USING (host_user_id = auth.uid());

CREATE POLICY "Allow host to update their table"
  ON public.tables FOR UPDATE
  USING (host_user_id = auth.uid())
  WITH CHECK (host_user_id = auth.uid());

CREATE POLICY "Allow members and host to read table details"
  ON public.tables FOR SELECT
  USING (host_user_id = auth.uid() OR is_user_member_of_table(table_id, auth.uid()));

-- ── table_members ──
CREATE POLICY "Allow hosts to add members to their tables"
  ON public.table_members FOR INSERT
  WITH CHECK (is_user_host_of_table(table_id, auth.uid()));

CREATE POLICY "Allow hosts to remove members from their tables"
  ON public.table_members FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM tables pt
    WHERE pt.table_id = table_members.table_id AND pt.host_user_id = auth.uid()
  ));

CREATE POLICY "Allow members to leave tables"
  ON public.table_members FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Allow members to read own membership and hosts to read their ta"
  ON public.table_members FOR SELECT
  USING (user_id = auth.uid() OR is_user_member_of_table(table_id, auth.uid()));

CREATE POLICY "allow_table_settlement_updates"
  ON public.table_members FOR UPDATE
  USING (is_user_host_of_table(table_id, auth.uid()));

-- ── bet_proposals ──
CREATE POLICY "Allow members to view bet proposals in their tables"
  ON public.bet_proposals FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM table_members tm
    WHERE tm.table_id = bet_proposals.table_id AND tm.user_id = auth.uid()
  ));

CREATE POLICY "bet_proposals_insert_scoped_active_only"
  ON public.bet_proposals FOR INSERT
  WITH CHECK (
    proposer_user_id = auth.uid()
    AND is_user_member_of_table(table_id, auth.uid())
    AND bet_status = 'active'::bet_lifecycle_status
    AND winning_choice IS NULL
    AND resolution_time IS NULL
  );

CREATE POLICY "bet_proposals_update_none"
  ON public.bet_proposals FOR UPDATE
  USING (false) WITH CHECK (false);

CREATE POLICY "bet_proposals_delete_none"
  ON public.bet_proposals FOR DELETE
  USING (false);

-- ── bet_participations ──
CREATE POLICY "bet_participations_select_scoped"
  ON public.bet_participations FOR SELECT
  USING (
    auth.uid() = user_id
    OR (is_table_member(table_id, auth.uid()) AND NOT is_bet_open(bet_id))
  );

CREATE POLICY "bet_participations_insert_scoped"
  ON public.bet_participations FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND is_table_member(table_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM bet_proposals bp
      WHERE bp.bet_id = bet_participations.bet_id
        AND bp.table_id = bet_participations.table_id
        AND bp.bet_status = 'active'::bet_lifecycle_status
        AND is_bet_open(bp.bet_id)
    )
  );

CREATE POLICY "bet_participations_update_scoped"
  ON public.bet_participations FOR UPDATE
  USING (auth.uid() = user_id AND is_table_member(table_id, auth.uid()) AND is_bet_open(bet_id))
  WITH CHECK (auth.uid() = user_id AND is_table_member(table_id, auth.uid()) AND is_bet_open(bet_id));

CREATE POLICY "bet_participations_delete_none"
  ON public.bet_participations FOR DELETE
  USING (false);

-- ── friend_requests ──
CREATE POLICY "friend_requests_select"
  ON public.friend_requests FOR SELECT
  USING (auth.uid() = sender_user_id OR auth.uid() = receiver_user_id);

CREATE POLICY "friend_requests_insert"
  ON public.friend_requests FOR INSERT
  WITH CHECK (auth.uid() = sender_user_id AND sender_user_id <> receiver_user_id);

CREATE POLICY "friend_requests_update"
  ON public.friend_requests FOR UPDATE
  USING (auth.uid() = sender_user_id OR auth.uid() = receiver_user_id)
  WITH CHECK (auth.uid() = sender_user_id OR auth.uid() = receiver_user_id);

-- ── friends ──
CREATE POLICY "Allow users to read their own friendships"
  ON public.friends FOR SELECT
  USING (auth.uid() = user_id1 OR auth.uid() = user_id2);

CREATE POLICY "Allow users to add friends"
  ON public.friends FOR INSERT
  WITH CHECK (auth.uid() = user_id1 AND user_id1 <> user_id2);

CREATE POLICY "Allow users to remove their own friendships"
  ON public.friends FOR DELETE
  USING (auth.uid() = user_id1 OR auth.uid() = user_id2);

-- ── messages ──
CREATE POLICY "messages_select_for_members"
  ON public.messages FOR SELECT
  USING (auth.role() = 'service_role' OR (auth.uid() IS NOT NULL AND is_user_member_of_table(table_id, auth.uid())));

CREATE POLICY "messages_insert_for_members"
  ON public.messages FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR (auth.uid() IS NOT NULL AND is_user_member_of_table(table_id, auth.uid())));

-- ── system_messages ──
CREATE POLICY "system_messages_select"
  ON public.system_messages FOR SELECT
  USING (true);

CREATE POLICY "system_messages_insert_service_role_only"
  ON public.system_messages FOR INSERT
  WITH CHECK (
    current_setting('request.jwt.claim.role', true) = 'service_role'
    OR CURRENT_USER = 'postgres'
  );

CREATE POLICY "System notifications updates are restricted"
  ON public.system_messages FOR UPDATE
  USING (false);

CREATE POLICY "System notifications deletes are restricted"
  ON public.system_messages FOR DELETE
  USING (false);

-- ── text_messages ──
CREATE POLICY "text_messages_select_for_members"
  ON public.text_messages FOR SELECT
  USING (is_user_member_of_table(table_id, auth.uid()));

CREATE POLICY "text_messages_insert_for_members"
  ON public.text_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_user_member_of_table(table_id, auth.uid()));

CREATE POLICY "Users can update their own text messages"
  ON public.text_messages FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own text messages"
  ON public.text_messages FOR DELETE
  USING (auth.uid() = user_id);

-- ── resolution_history ──
CREATE POLICY "resolution_history_select_for_members"
  ON public.resolution_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM bet_proposals bp
    WHERE bp.bet_id = resolution_history.bet_id
      AND (bp.proposer_user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM table_members tm
        WHERE tm.table_id = bp.table_id AND tm.user_id = auth.uid()
      ))
  ));


-- ============================================================================
-- 6. REALTIME PUBLICATIONS
-- ============================================================================
-- Supabase manages the `supabase_realtime` publication.
-- Tables that should be in it for Realtime subscriptions:
-- (This is informational — Supabase manages this via the dashboard or CLI.)
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.bet_proposals;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.bet_participations;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.table_members;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.text_messages;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.system_messages;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.tables;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.friends;
