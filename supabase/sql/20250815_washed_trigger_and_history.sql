-- Create resolution_history table (optional)
CREATE TABLE IF NOT EXISTS public.resolution_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_id uuid NOT NULL REFERENCES public.bet_proposals (bet_id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('resolve_attempt','resolved','washed')),
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger function to emit system message on washed transitions
CREATE OR REPLACE FUNCTION public.create_system_message_on_bet_washed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_sys_id uuid;
  v_text text;
BEGIN
  IF (OLD.bet_status IS DISTINCT FROM 'washed' AND NEW.bet_status = 'washed') THEN
    v_text := format(
      'Bet %s washed.',
      left(NEW.bet_id::text, 8)
    );

    INSERT INTO public.system_messages (table_id, message_text, generated_at)
    VALUES (NEW.table_id, v_text, now())
    RETURNING system_message_id INTO v_sys_id;

    INSERT INTO public.feed_items (table_id, item_type, system_message_id, item_created_at)
    VALUES (NEW.table_id, 'system_message', v_sys_id, now());
  END IF;
  RETURN NEW;
END;
$$;

-- Ensure trigger exists for washed transitions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_bet_proposals_washed_msg'
  ) THEN
    CREATE TRIGGER trg_bet_proposals_washed_msg
    AFTER UPDATE ON public.bet_proposals
    FOR EACH ROW
    EXECUTE FUNCTION public.create_system_message_on_bet_washed();
  END IF;
END $$;
