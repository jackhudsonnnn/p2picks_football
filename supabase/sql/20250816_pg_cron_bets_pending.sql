-- Ensure set_bets_pending() is SECURITY DEFINER to run under cron with rights
CREATE OR REPLACE FUNCTION public.set_bets_pending()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE public.bet_proposals
    SET bet_status = 'pending'
  WHERE bet_status = 'active'
    AND close_time IS NOT NULL
    AND now() >= close_time;
END;
$$;

-- Enable pg_cron extension if not already
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the job to run every minute
-- Adjust as needed (e.g., '*/15 * * * *' for every 15 minutes)
SELECT cron.schedule(
  'p2picks_set_bets_pending',
  '* * * * *',
  $$SELECT public.set_bets_pending();$$
);

-- Idempotent: if job exists, update schedule
-- Note: Some Supabase environments may require deleting and recreating the job if names collide.
