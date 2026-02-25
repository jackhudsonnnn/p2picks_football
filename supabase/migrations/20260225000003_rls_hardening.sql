-- ============================================================================
-- Phase 5 — RLS Hardening
-- ============================================================================
-- Goal: Close every "missing policy" gap and tighten overly-broad policies.
--
-- Changes in this migration:
--   1. Deny INSERT/UPDATE/DELETE on resolution_history for non-service-role
--   2. Deny INSERT + DELETE on users (provisioning is trigger-only)
--   3. friend_requests: add DELETE policy (sender deletes own pending)
--   4. users SELECT: drop redundant duplicate "individual read" policy
--   5. users SELECT: create user_profiles view (user_id, username only)
--      for cross-user reads; keep own-row policy for full profile access
--   6. text_messages: lock down UPDATE + DELETE (all writes go through server)
--   7. table_members: immutable-fields trigger for table_id + user_id
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. resolution_history — explicit deny for INSERT / UPDATE / DELETE
--    (service_role bypasses RLS entirely, so these only block anon/authed)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "resolution_history_insert_deny"
  ON public.resolution_history FOR INSERT
  WITH CHECK (false);

CREATE POLICY "resolution_history_update_deny"
  ON public.resolution_history FOR UPDATE
  USING (false);

CREATE POLICY "resolution_history_delete_deny"
  ON public.resolution_history FOR DELETE
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. users — deny INSERT and DELETE for all non-service-role callers
--    New users are provisioned exclusively via the handle_new_user() trigger
--    on auth.users INSERT. Deletion is not permitted from the application layer.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "users_insert_deny"
  ON public.users FOR INSERT
  WITH CHECK (false);

CREATE POLICY "users_delete_deny"
  ON public.users FOR DELETE
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. friend_requests — DELETE policy
--    Senders may delete their own pending requests (e.g. to withdraw them).
--    Receivers and all other callers are denied.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "friend_requests_delete_sender_pending"
  ON public.friend_requests FOR DELETE
  USING (
    auth.uid() = sender_user_id
    AND status = 'pending'::friend_request_status
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. users SELECT — drop the redundant narrow policy
--    "Allow individual read access to own profile" is fully covered by
--    "Allow authenticated read access to usernames" (role = authenticated).
--    Keeping both is confusing; drop the narrower one.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY "Allow individual read access to own profile" ON public.users;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. user_profiles view — safe cross-user read surface (user_id + username only)
--
--    PostgreSQL RLS is row-level only — it cannot restrict which columns are
--    returned. To expose only user_id + username to other authenticated users,
--    we use a SECURITY DEFINER view.
--
--    Client usage:
--      - getUsernamesByIds() → select from user_profiles (read-only, username only)
--      - listFriends()       → select from user_profiles
--      - getAuthUserProfile()→ still queries public.users directly (own row, full cols)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.user_profiles
  WITH (security_invoker = false)
AS
  SELECT user_id, username
  FROM public.users;

-- Grant SELECT to authenticated role so PostgREST exposes it
GRANT SELECT ON public.user_profiles TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. text_messages — lock down UPDATE + DELETE
--
--    All chat message writes now go through the server (POST /tables/:tableId/messages).
--    Message editing and deletion are not application features; these permissive
--    policies were left over from early development.
--
--    We DROP the old permissive policies and replace with explicit deny policies.
--    This ensures that even if a client somehow obtains a valid anon key, it
--    cannot edit or delete messages.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY "Users can update their own text messages" ON public.text_messages;
DROP POLICY "Users can delete their own text messages" ON public.text_messages;

CREATE POLICY "text_messages_update_deny"
  ON public.text_messages FOR UPDATE
  USING (false);

CREATE POLICY "text_messages_delete_deny"
  ON public.text_messages FOR DELETE
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. table_members — immutable-fields trigger
--
--    The allow_table_settlement_updates RLS policy lets the host UPDATE any
--    column on table_members. Add a BEFORE UPDATE trigger to ensure
--    table_id and user_id are never changed (even by the host), matching the
--    pattern used by enforce_immutable_bet_participation_fields().
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_immutable_table_member_fields()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.table_id <> OLD.table_id THEN
    RAISE EXCEPTION 'table_id is immutable on table_members';
  END IF;
  IF NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'user_id is immutable on table_members';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_table_members_immutable_fields
  BEFORE UPDATE ON public.table_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_immutable_table_member_fields();
