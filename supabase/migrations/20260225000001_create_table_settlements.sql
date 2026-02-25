-- ============================================================================
-- CREATE table_settlements (referenced in server code but missing from schema)
-- See: TODO.md §6.3
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.table_settlements (
  settlement_id    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_id         uuid        NOT NULL REFERENCES public.tables (table_id),
  settled_by       uuid        NOT NULL REFERENCES public.users (user_id),
  settled_at       timestamptz NOT NULL DEFAULT now(),
  balance_snapshot jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.table_settlements ENABLE ROW LEVEL SECURITY;

-- Only service_role / postgres can write (server-side only)
CREATE POLICY "table_settlements_insert_service_role_only"
  ON public.table_settlements FOR INSERT
  WITH CHECK (
    current_setting('request.jwt.claim.role', true) = 'service_role'
    OR CURRENT_USER = 'postgres'
  );

-- Deny all client-side updates
CREATE POLICY "table_settlements_update_none"
  ON public.table_settlements FOR UPDATE
  USING (false) WITH CHECK (false);

-- Deny all client-side deletes
CREATE POLICY "table_settlements_delete_none"
  ON public.table_settlements FOR DELETE
  USING (false);

-- Table members can read settlement history for their tables
CREATE POLICY "table_settlements_select_for_members"
  ON public.table_settlements FOR SELECT
  USING (
    is_user_member_of_table(table_id, auth.uid())
    OR is_user_host_of_table(table_id, auth.uid())
  );

-- Index for querying settlements by table
CREATE INDEX IF NOT EXISTS idx_table_settlements_table_id
  ON public.table_settlements (table_id);
