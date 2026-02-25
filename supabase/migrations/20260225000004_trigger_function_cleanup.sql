-- ============================================================================
-- MIGRATION: Trigger & Function Cleanup (Phase 6)
-- Date: 2026-02-25
--
-- Changes:
--   1. Drop trg_set_bet_close_time_before_insert (fully redundant with
--      trg_set_bet_close_time which already fires on INSERT OR UPDATE)
--   2. Consolidate is_table_member → is_user_member_of_table:
--        - Rewrite bet_participations_select_scoped,
--          bet_participations_insert_scoped, and
--          bet_participations_update_scoped to call the canonical
--          is_user_member_of_table (which already has SECURITY DEFINER)
--        - Drop the orphan is_table_member function
--   3. Add SECURITY DEFINER + SET search_path TO 'public' to four functions
--      that were missing it:
--        - set_bet_resolved_on_winning_choice
--        - enforce_immutable_bet_participation_fields
--        - is_bet_open
--        - set_bet_close_time
--   4. Remove server-side createWashSystemMessage — the DB trigger
--      trg_bet_proposals_washed_msg already fires create_system_message_on_bet_washed()
--      on every bet_status transition to 'washed', which inserts the system
--      message.  Calling it from washService.ts too produces a duplicate
--      message.  (Server-side change tracked separately; migration drops
--      nothing — only DB changes are here.)
--   5. Add inline comments to transition_bet_to_pending and apply_bet_payouts
--      explaining the two-phase escrow model.
-- ============================================================================


-- ============================================================================
-- 1. DROP REDUNDANT TRIGGER
--    trg_set_bet_close_time fires BEFORE INSERT OR UPDATE.
--    trg_set_bet_close_time_before_insert fires BEFORE INSERT only.
--    Both call set_bet_close_time() — the second is a subset of the first.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_set_bet_close_time_before_insert ON public.bet_proposals;


-- ============================================================================
-- 2. CONSOLIDATE is_table_member → is_user_member_of_table
--
--    is_table_member lacks SECURITY DEFINER and STABLE, which means it
--    executes as the calling role (anon/authenticated) and re-plans on every
--    call.  is_user_member_of_table is the correct, hardened version.
--
--    The three bet_participations policies that reference is_table_member must
--    be recreated to use is_user_member_of_table instead.
-- ============================================================================

-- 2a. Recreate bet_participations_select_scoped
DROP POLICY IF EXISTS "bet_participations_select_scoped" ON public.bet_participations;
CREATE POLICY "bet_participations_select_scoped"
  ON public.bet_participations
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR (
      is_user_member_of_table(table_id, auth.uid())
      AND NOT is_bet_open(bet_id)
    )
  );

-- 2b. Recreate bet_participations_insert_scoped
DROP POLICY IF EXISTS "bet_participations_insert_scoped" ON public.bet_participations;
CREATE POLICY "bet_participations_insert_scoped"
  ON public.bet_participations
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND is_user_member_of_table(table_id, auth.uid())
    AND EXISTS (
      SELECT 1
        FROM public.bet_proposals bp
       WHERE bp.bet_id    = bet_participations.bet_id
         AND bp.table_id  = bet_participations.table_id
         AND bp.bet_status = 'active'::bet_lifecycle_status
         AND is_bet_open(bp.bet_id)
    )
  );

-- 2c. Recreate bet_participations_update_scoped
DROP POLICY IF EXISTS "bet_participations_update_scoped" ON public.bet_participations;
CREATE POLICY "bet_participations_update_scoped"
  ON public.bet_participations
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND is_user_member_of_table(table_id, auth.uid())
    AND is_bet_open(bet_id)
  )
  WITH CHECK (
    auth.uid() = user_id
    AND is_user_member_of_table(table_id, auth.uid())
    AND is_bet_open(bet_id)
  );

-- 2d. Drop the now-unused is_table_member function
DROP FUNCTION IF EXISTS public.is_table_member(uuid, uuid);


-- ============================================================================
-- 3. HARDEN FOUR FUNCTIONS WITH SECURITY DEFINER + search_path
--
--    Without SECURITY DEFINER these functions execute under the calling
--    role's search_path, which allows a malicious search_path override to
--    redirect table references to attacker-controlled objects.
--    Without STABLE the planner cannot cache the result across a single
--    query — adding it here where semantics allow it.
-- ============================================================================

-- 3a. set_bet_close_time
CREATE OR REPLACE FUNCTION public.set_bet_close_time()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.close_time := NEW.proposal_time + make_interval(secs => NEW.time_limit_seconds::double precision);
  RETURN NEW;
END;
$function$;

-- 3b. set_bet_resolved_on_winning_choice
CREATE OR REPLACE FUNCTION public.set_bet_resolved_on_winning_choice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

-- 3c. enforce_immutable_bet_participation_fields
CREATE OR REPLACE FUNCTION public.enforce_immutable_bet_participation_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.bet_id <> OLD.bet_id OR NEW.table_id <> OLD.table_id OR NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'bet_participations immutable fields (bet_id, table_id, user_id) cannot be modified';
  END IF;
  RETURN NEW;
END;
$function$;

-- 3d. is_bet_open (add SECURITY DEFINER; keep STABLE for planner caching)
CREATE OR REPLACE FUNCTION public.is_bet_open(p_bet_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.bet_proposals bp
    WHERE bp.bet_id = p_bet_id
      AND bp.bet_status = 'active'::bet_lifecycle_status
      AND now() < bp.close_time
  );
$function$;


-- ============================================================================
-- 4. DOCUMENT THE TWO-PHASE ESCROW MODEL
--    Re-declare transition_bet_to_pending and apply_bet_payouts with
--    explanatory header comments.  No logic changes — pure documentation.
--
--    Two-phase escrow model:
--      Phase 1 (active → pending, via transition_bet_to_pending):
--        For each participant:
--          bust_balance  -= wager          (debit their holdings)
--          sweep_balance += (payout_share - wager)
--                                          (escrow the contingent profit)
--        At this point bust_balance reflects what they have if they LOSE,
--        and sweep_balance holds the "bonus" they earn if they WIN.
--
--      Phase 2 (pending → resolved, via apply_bet_payouts AFTER trigger):
--        For each winner:
--          bust_balance  += payout_share   (restore wager + profit)
--          push_balance  += profit         (record net profit)
--          sweep_balance -= remainder rounding correction
--        For each loser:
--          push_balance  -= wager          (record net loss)
--          sweep_balance -= payout_share   (clear escrowed contingent amount)
--
--      Wash path (pending → washed, via refund_bet_points_on_wash):
--        For each participant:
--          bust_balance  += wager          (return their wager)
--          sweep_balance -= (payout_share - wager)
--                                          (clear escrowed contingent amount)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.transition_bet_to_pending(p_bet_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ── Phase 1 of the two-phase escrow model ───────────────────────────────────
-- Called by the bet lifecycle service when a bet's close_time is reached.
-- Validates that the bet is still active and has meaningful participation,
-- then atomically transitions it to 'pending' and debits each participant's
-- bust_balance (wager escrow) while crediting sweep_balance with their
-- contingent payout share.  If insufficient distinct guesses exist, the bet
-- is immediately washed instead.
--
-- Returns one of:
--   'pending'                       — success, bet is now pending
--   'washed_insufficient_participation' — bet washed (all same guess / no guesses)
--   'forbidden'                     — caller is not service_role or postgres
--   'invalid_argument'              — p_bet_id is NULL
--   'not_found'                     — no bet with that ID
--   'not_active'                    — bet is already past active
--   'no_close_time'                 — close_time missing (should never happen)
--   'too_early'                     — close_time has not elapsed yet
-- ── end header ───────────────────────────────────────────────────────────────
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

  -- Wash immediately if no real guesses or everyone picked the same option
  -- (a one-sided bet has no payout pool to distribute)
  IF v_total_non_no_entry = 0 OR v_distinct_non_no_entry = 1 THEN
    UPDATE public.bet_proposals
       SET bet_status = 'washed'::bet_lifecycle_status,
           resolution_time = now()
     WHERE bet_id = v_bet.bet_id
       AND bet_status = 'active'::bet_lifecycle_status;
    RETURN 'washed_insufficient_participation';
  END IF;

  -- Transition to pending and capture table context for balance updates
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

  -- Phase 1 escrow: debit wager from bust_balance; credit contingent payout
  -- share to sweep_balance.  Sweep holds the *total* potential payout
  -- (wager + profit slice) so that apply_bet_payouts can later net it out.
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

    v_loser_pot    := v_wager * (v_participant_count - v_choice_count);
    -- Use trunc (not round) for exact math — no IEEE-754 surprises
    v_payout_share := v_wager + trunc(v_loser_pot / v_choice_count, 2);

    UPDATE public.table_members tm
       SET bust_balance  = bust_balance  - v_wager,
           sweep_balance = sweep_balance + (v_payout_share - v_wager)
     WHERE tm.table_id = v_table_id
       AND tm.user_id  = v_participant.user_id;
  END LOOP;

  RETURN 'pending';
END;
$function$;


CREATE OR REPLACE FUNCTION public.apply_bet_payouts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ── Phase 2 of the two-phase escrow model ───────────────────────────────────
-- Fired AFTER UPDATE on bet_proposals when bet_status transitions to
-- 'resolved' and winning_choice is set.
--
-- At this point each participant already has:
--   bust_balance  reduced by their wager    (from Phase 1)
--   sweep_balance holding their contingent  (from Phase 1)
--
-- Phase 2 actions:
--   Winners: restore bust_balance by full payout_share, record net profit
--            in push_balance, clear the sweep_balance adjustment.
--   Losers:  record net loss in push_balance, clear sweep_balance
--            contingent that will never materialise.
--
-- Penny-level remainder (from integer division) is distributed one cent at
-- a time to randomly ordered winners so totals are always exact.
-- ── end header ───────────────────────────────────────────────────────────────
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

    -- Distribute remainder cents one at a time in random winner order
    v_remainder_amt          := GREATEST(v_loser_pot - (v_base_share * v_winner_count), 0);
    v_remainder_cents        := ROUND(v_remainder_amt * 100)::integer;
    v_extra_cents_per_winner := CASE WHEN v_winner_count > 0 THEN v_remainder_cents / v_winner_count ELSE 0 END;
    v_extra_cents_mod        := CASE WHEN v_winner_count > 0 THEN v_remainder_cents % v_winner_count ELSE 0 END;

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

    -- Clear loser sweep contingent and record their push_balance loss
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
      v_potential_payout    := v_wager_each + trunc(v_potential_loser_pot / NULLIF(v_choice_count, 0), 2);

      IF v_participant.user_guess = NEW.winning_choice THEN
        -- Winners handled above via the CTE UPDATE; nothing more to do here
        NULL;
      ELSE
        UPDATE public.table_members tm
        SET push_balance  = push_balance  - v_wager_each,
            sweep_balance = sweep_balance - COALESCE(v_potential_payout, 0)
        WHERE tm.table_id = NEW.table_id
          AND tm.user_id  = v_participant.user_id;
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
