/**
 * A stable per-tab/session ID generated once at module load time.
 *
 * Purpose: appended to all Supabase Realtime channel names so that when the
 * same user opens the app in multiple tabs, each tab gets independent channels
 * and they cannot interfere with each other (§7.2 — channel name collisions).
 *
 * crypto.randomUUID() is available in all modern browsers and in Node ≥ 14.17.
 */
export const SESSION_ID: string =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
