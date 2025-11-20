# Client Caching & Storage TODO

Prioritize this plan when implementing client-side caching and persistence aligned with the P2Picks gameplay loop defined in `promptEngineering/p2picks.md`. All work below assumes no need to migrate or preserve existing browser storage.

---

## Guiding principles

- **Respect the bet lifecycle**: Proposal → Active → Pending → Resolved/Washed. Cache invalidation has to follow these transitions so members never see stale balances, odds, or system messages.
- **Prefer revalidation over perpetual staleness**: Default to stale-while-revalidate where possible to keep the UI responsive while Supabase remains the source of truth.
- **Segment storage**: Stable metadata in `localStorage`, session-specific or user-sensitive data in `sessionStorage`, and mutable real-time records in an in-memory cache (React Query suggested).
- **Treat Supabase realtime as invalidation signals**: Use subscriptions to patch caches instead of re-fetching whole collections.
- **Instrument first**: Add lightweight logging/dev tooling to observe cache hits, misses, and eviction so we can tune TTLs quickly.

---

## Foundation & shared tasks

| Priority | Task | Notes |
| --- | --- | --- |
| P0 | [ ] Introduce `@tanstack/react-query` with `QueryClientProvider` at `App` root | Enables normalized in-memory caching, background refetch, and dedupe. |
| P0 | [ ] Add `persistQueryClient` adapter with pluggable storage | Implement session vs local persistence via custom storage adapters. |
| P0 | [ ] Consolidate HTTP utilities | Merge `@shared/utils/http` helpers into `@data/clients/restClient`, expose one fetch layer with middleware hooks for caching/logging. |
| P1 | [ ] Create `cacheConfig.ts` describing TTL defaults (per entity) | Co-locate shared constants and helper functions. |
| P1 | [ ] Add diagnostic dev panel/toggle (e.g., `?cacheDebug=true`) | Display active cache keys, TTLs, and pending refetch timers. |
| P1 | [ ] Wire Supabase realtime events to `queryClient.invalidateQueries` or `setQueryData` | Ensure push updates fan out across dependent caches. |
| P2 | [ ] Document storage shapes and invalidation triggers in `docs/` | Keep this README in sync as we iterate. |

Dependencies: Introduce foundation (React Query + HTTP consolidation) before domain-specific sections below.

---

## 1. Bet mode overviews (`useModeCatalog`, `ModeReference`)

- **Current**: Uses module-level variables for temporary caching; refetches on reload.
- **Target storage**: `localStorage` (TTL 24h) + React Query for hydration.

**Tasks**
- [ ] Migrate `useModeCatalog` to React Query (`queryKey = ['modeOverviews']`).
- [ ] Hydrate query from `localStorage` on mount; persist updates with TTL and schema version.
- [ ] Add manual refresh triggering `invalidateQueries` + re-fetch.
- [ ] Ensure `ModeReference` handles loading states via query selectors (no duplicate spinners).

**Invalidation triggers**
- Manual refresh button.
- Backend-provided `updated_at` (if available) or scheduled midnight sweep.

---

## 2. Bet proposal bootstrap (`BetProposalForm`)

- **Current**: Fetches `/api/bet-proposals/bootstrap` every modal open.
- **Target storage**: `sessionStorage` (TTL 5 min) + shared React Query cache.

**Tasks**
- [ ] Wrap bootstrap call in React Query (`['betProposalBootstrap']`).
- [ ] Persist snapshot to `sessionStorage` with timestamp; check TTL before reusing.
- [ ] Plug preview form into query state to avoid extra spinners inside modal.
- [ ] Expose hook to prefetch during TableView load when user is host.

**Invalidation triggers**
- Supabase event for game schedule change (future enhancement) or manual “Refresh games & modes”.

---

## 3. Mode config steps & previews

- **Current**: In-memory `Map` cache; lost on reload.
- **Target storage**: React Query for config definitions, `sessionStorage` for preview payloads keyed by mode/game/config signature.

**Tasks**
- [ ] Extract config loader into `useModeConfig(modeKey, gameId)` with query caching + optimistic step reuse.
- [ ] Persist preview results (`modeKey + betId + hash(config)`) with TTL (e.g., 60s) to avoid thrashing when user tweaks wager/time.
- [ ] Provide `invalidatePreviewCache` hook on `wager/time` change.
- [ ] Log errors to cache diagnostics for debugging preview API failures.

**Invalidation triggers**
- Bet submission (clear preview cache for that bet).
- Config step change or API error codes suggesting stale data.

---

## 4. Table roster (`useTableView`, `useTableMembers`)

- **Current**: Direct fetch each mount; relies on realtime subscription to refetch.
- **Target storage**: React Query (`['table', tableId]`) hydrated by subscription diffs; optional session persistence per table.

**Tasks**
- [ ] Wrap `fetchCurrentTable` with query; `useTableView` consumes query state.
- [ ] On realtime `INSERT/DELETE/UPDATE`, call `queryClient.setQueryData` to merge member changes without round trip.
- [ ] Persist `TableWithMembers` snapshot to `sessionStorage` so re-opening TableView reloads instantly.
- [ ] Add background refetch interval (e.g., 2 minutes) as safety net.

**Invalidation triggers**
- User signs out (clear storage).
- Table settlement (force refetch + flush caches to avoid stale balances).

---

## 5. Table feed (`useTableFeed`)

- **Current**: Re-fetches first page on every realtime event; loses history on reload.
- **Target storage**: React Query for paginated data + `sessionStorage` to keep last 50 messages per table.

**Tasks**
- [ ] Refactor to use `useInfiniteQuery` with cursor-based fetching.
- [ ] Persist `pages[0]` (latest messages) + cursor per table key in `sessionStorage`.
- [ ] Patch incoming realtime events into cached pages (prepend/merge) instead of reloading.
- [ ] Add optimistic updates for sent chat messages (reconcile on server ack).
- [ ] Provide API to flush cache when tableId changes or user manually refreshes.

**Invalidation triggers**
- Bet settlement events (ensure bet proposal message updates reflect winning condition).
- Manual “Load older messages” reaching end-of-history.

---

## 6. Tickets dashboard (`useTickets`)

- **Current**: Full fetch on mount; updates come from Supabase watchers but no persistence.
- **Target storage**: React Query (`['tickets', userId]`) persisted to `sessionStorage`.

**Tasks**
- [ ] Migrate `getUserTickets` call into query with selectors for counts.
- [ ] Hydrate from session storage on load; update storage on query settle.
- [ ] On realtime bet proposal updates, call `setQueryData` to patch relevant ticket.
- [ ] After `changeGuess`, optimistically update cached ticket before awaiting server response.
- [ ] Ensure cache flush on sign-out or when `userId` changes.

**Invalidation triggers**
- Bet state transitions (active→pending→resolved/washed).
- Ticket deletion (user leaves bet) via realtime `DELETE` event.

---

## 7. UI & UX state persistence

Components: TableView tab selection, Tickets filters/pagination, Table search, Friends search, etc.

**Tasks**
- [ ] Create `useSessionState(key, defaultValue)` hook wrapping `sessionStorage` (with JSON serialization + error handling).
- [ ] Persist TableView tab, open modals, and draft chat text per tableId.
- [ ] Persist TicketsPage filters & current page; reset when user changes status set.
- [ ] Persist TablesList search term and last pagination state.
- [ ] Clear session state on logout and when switching Supabase user.

**Success metrics**
- Navigating away and back to a page restores the last UX state for that user session.

---

## 8. HTTP utility consolidation (`@data/clients/restClient` vs `@shared/utils/http`)

**Tasks**
- [ ] Audit `@shared/utils/http` usages and remove duplicates.
- [ ] Expand `restClient` to expose request/response interceptors for logging, caching, and auth re-use.
- [ ] Provide typed helper `fetchJSONCached` that integrates with React Query prefetch or manual caching.
- [ ] Update imports across the repo to use the unified client.
- [ ] Add tests for error handling + token refresh to prevent regressions.

**Follow-ups**
- Consider adding retry/backoff strategy configurable per endpoint.
- Document how to extend client for future storage-backed caches.

---

## Verification checklist (per feature)

- [ ] Loading states render instantly from cache/persisted state.
- [ ] Background refetch does not flicker UI (`keepPreviousData` true).
- [ ] Supabase realtime updates reflect in cached data without manual refresh.
- [ ] Storage cleared appropriately on sign-out.
- [ ] Cache diagnostics panel shows accurate TTL and hit/miss counts.

---

## Open questions

1. Should we namespace storage keys per environment (dev vs prod) to avoid collisions? (Recommended.)
2. Do we need encryption/obfuscation for any session data? (Current requirements say anonymity is key—evaluate once sensitive data is stored.)
3. Can server emit cache invalidation headers or version numbers to simplify TTL management? Coordinate with backend before hard-coding durations.

Update this document as tasks are completed or scope changes. Keep the latest status in version control to share progress with the wider team.
