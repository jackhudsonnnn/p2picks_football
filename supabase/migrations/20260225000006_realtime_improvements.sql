-- Phase 8 — Realtime & Subscription Improvements
-- Task 4: Debounce touch_table_last_activity trigger function.
--
-- Problem: touch_table_last_activity fires on INSERT/UPDATE for 6 tables
-- (bet_participations, bet_proposals, messages, system_messages, table_members,
-- text_messages). During rapid chat, every message fires an UPDATE on the
-- `tables` row which creates write amplification — potentially dozens of UPDATEs
-- per second for an active table.
--
-- Fix: Skip the UPDATE if last_activity_at was already set within the last 5
-- seconds. This caps write noise to 1 tables UPDATE per 5-second window while
-- still keeping last_activity_at current for sorting/display.

CREATE OR REPLACE FUNCTION public.touch_table_last_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- §7.3 debounce: only write if the timestamp is stale (> 5 s old).
  -- This prevents write amplification during rapid chat while keeping
  -- last_activity_at accurate for table-list sorting.
  if new.table_id is not null then
    update public.tables
       set last_activity_at = now()
     where table_id = new.table_id
       and (
         last_activity_at is null
         or last_activity_at < now() - interval '5 seconds'
       );
  end if;
  return new;
end;
$function$;
