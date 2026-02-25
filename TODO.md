# Supabase & Architecture Audit — TODO

> Full audit of Supabase setup, RLS policies, client/server split, triggers, and RPCs.  
> Generated 2025-02-25 from a deep review of the codebase.

---

## Table of Contents

1. [Critical — Security & Data Integrity](#1-critical--security--data-integrity)
2. [Client → Server Migration (move Supabase calls off the client)](#2-client--server-migration)
3. [Server → Supabase Migration (move logic into DB)](#3-server--supabase-migration)
4. [RLS Hardening](#4-rls-hardening)
5. [Trigger & RPC Improvements](#5-trigger--rpc-improvements)
6. [Schema & Constraint Improvements](#6-schema--constraint-improvements)
7. [Realtime Subscription Improvements](#7-realtime-subscription-improvements)
8. [General Architecture Improvements](#8-general-architecture-improvements)

---

## 1. Critical — Security & Data Integrity

### 1.1 `settleTable` is on the client — must move to server ⚠️

**File:** `client/src/data/repositories/tablesRepository.ts` (`settleTable()`)

The client-side `settleTable` function directly:
- Reads all member balances via the anon key
- Computes new balances in JS
- Issues N parallel `UPDATE` calls to `table_members`
- Inserts a `system_messages` row
- Implements a DIY rollback on failure

**Problems:**
1. **No atomicity** — If any of the N updates fail or the browser tab closes mid-settle, balances are partially zeroed with no recovery. The "rollback" is a best-effort `Promise.all` that itself can fail.
2. **No authorization check** — RLS on `table_members` UPDATE is `is_user_host_of_table(table_id, auth.uid())`, which is correct, but the business rule "no active/pending bets" is only enforced in the *server* `tableSettlementService` — the client bypasses it entirely.
3. **Race condition** — Two simultaneous settlements can overlap and double-zero.
4. **Client inserts `system_messages`** — The `system_messages_insert_service_role_only` RLS policy requires `service_role` or `postgres`. The client is using the anon key — this insert will be **silently rejected** by RLS. This is a live bug.

**Action:**
- [ ] Delete `settleTable()` from `tablesRepository.ts`
- [ ] Route all settlements through `POST /api/tables/:tableId/settle` (already exists on the server)
- [ ] Server's `tableSettlementService.ts` already validates host ownership + no active bets — wrap the balance-zeroing + settlement-record in a single Supabase RPC (see §3.1)

---

### 1.2 `createTable` is split across two unrelated writes

**File:** `client/src/data/repositories/tablesRepository.ts` (`createTable()`)

```
insert into tables → if ok → insert into table_members
```

If the second insert fails the table exists with no host membership row.

**Action:**
- [ ] Move to a server endpoint `POST /api/tables` that does both writes in a single Supabase RPC or at least a service-role transaction
- [ ] Or create an `AFTER INSERT` trigger on `tables` that auto-inserts the host as a member

---

### 1.3 `acceptBetProposal` is client-direct with no server validation

**File:** `client/src/data/repositories/betsRepository.ts` (`acceptBetProposal()`)

The client inserts directly into `bet_participations` using the anon key. RLS does enforce membership + bet open status, which is good, but:
- No rate limiting
- No server-side validation of `user_guess` (always `'No Entry'` here, but the write path is unprotected)
- `participation_time` is set from the client's clock, not `now()` on the server

**Action:**
- [ ] Move to a server endpoint `POST /api/bets/:betId/accept`
- [ ] Set `participation_time` to `now()` on the server or via a DB default

---

### 1.4 `changeGuess` (bet participation update) is client-direct

**File:** `client/src/features/bets/hooks/useTickets.ts` (`changeGuess()`)

Directly does `supabase.from('bet_participations').update({ user_guess })`. RLS checks `is_bet_open`, which is good, but:
- No server-side validation that `newGuess` is a valid option for the bet's mode
- No rate-limiting

**Action:**
- [ ] Move to `PATCH /api/bets/:betId/guess` with mode-specific validation
- [ ] Validate that the guess is one of the bet's configured options

---

### 1.5 `removeFriend` is client-direct with OR filter

**File:** `client/src/data/repositories/socialRepository.ts` (`removeFriend()`)

Uses `.or(...)` with interpolated UUIDs. The `friendController.ts` on the server already has `assertUuid()` guards against filter injection — the client path has none.

**Action:**
- [ ] Move to `DELETE /api/friends/:friendUserId` on the server
- [ ] Remove client-side direct Supabase delete

---

### 1.6 `addTableMember` / `removeTableMember` are client-direct

**File:** `client/src/data/repositories/tablesRepository.ts`

These directly insert/delete `table_members` rows. RLS enforces host-only for add and host-or-self for delete, which is good, but:
- No validation that the added user exists or is a friend
- No rate-limiting

**Action:**
- [ ] Move to server endpoints `POST /api/tables/:tableId/members` and `DELETE /api/tables/:tableId/members/:userId`

---

## 2. Client → Server Migration

*All client-side Supabase calls that should go through the server for validation, atomicity, and rate-limiting.*

| Client function | Current location | Recommended server endpoint | Priority |
|---|---|---|---|
| `settleTable` | `tablesRepository.ts` | `POST /api/tables/:tableId/settle` (exists) | 🔴 Critical |
| `createTable` | `tablesRepository.ts` | `POST /api/tables` (new) | 🔴 High |
| `acceptBetProposal` | `betsRepository.ts` | `POST /api/bets/:betId/accept` (new) | 🔴 High |
| `changeGuess` | `useTickets.ts` | `PATCH /api/bets/:betId/guess` (new) | 🟡 Medium |
| `addTableMember` | `tablesRepository.ts` | `POST /api/tables/:tableId/members` (new) | 🟡 Medium |
| `removeTableMember` | `tablesRepository.ts` | `DELETE /api/tables/:tableId/members/:userId` (new) | 🟡 Medium |
| `removeFriend` | `socialRepository.ts` | `DELETE /api/friends/:friendUserId` (new) | 🟡 Medium |
| `updateUsername` | `socialRepository.ts` | `PATCH /api/users/me/username` (new) | 🟢 Low |
| `getTable` | `tablesRepository.ts` | Keep — read-only, RLS-protected | ✅ OK |
| `getUserTables` | `tablesRepository.ts` | Keep (paginated version already on server) | ✅ OK |
| `hasUserAcceptedBet` | `betsRepository.ts` | Keep — read-only, RLS-protected | ✅ OK |
| `getBetParticipantCount` | `betsRepository.ts` | Keep — read-only, RLS-protected | ✅ OK |
| `getAuthUserProfile` | `socialRepository.ts` | Keep — auth.getUser() + own profile read | ✅ OK |
| `listFriendRelations` | `socialRepository.ts` | Keep — read-only, RLS-protected | ✅ OK |
| `listFriends` | `socialRepository.ts` | Keep — read-only, RLS-protected | ✅ OK |
| `isUsernameTaken` | `socialRepository.ts` | Keep — read-only, RLS-protected | ✅ OK |
| `getUsernamesByIds` | `usersRepository.ts` | Keep — read-only, RLS-protected | ✅ OK |

---

## 3. Server → Supabase Migration

*Server-side logic that would be more reliable, atomic, and performant as Supabase RPCs or triggers.*

### 3.1 Settlement should be an atomic RPC

**Current:** `server/src/services/table/tableSettlementService.ts` does:
1. `SELECT` members + balances
2. `UPDATE` all balances to 0
3. `INSERT` into `table_settlements`

Each is a separate round-trip. If step 3 fails, balances are already zeroed.

**Action:**
- [ ] Create `settle_table(p_table_id uuid, p_user_id uuid) RETURNS jsonb` RPC
- [ ] Wraps everything in a single PL/pgSQL function: validate host, check no active bets, snapshot balances, zero them, insert settlement record — all atomic
- [ ] Server calls `supabase.rpc('settle_table', ...)` instead of multiple queries

### 3.2 `createTable` + auto-add host member — trigger

- [ ] Create an `AFTER INSERT ON tables` trigger that inserts the host as a `table_members` row
- [ ] This makes table creation atomic regardless of whether it's called from client or server

### 3.3 Friend-accept + friendship insert — combine into RPC

**Current:** `friendController.ts` does:
1. `UPDATE friend_requests SET status = 'accepted'`  
2. `INSERT INTO friends (user_id1, user_id2)`

If step 2 fails, the request is marked accepted but no friendship row exists.

- [ ] Create `accept_friend_request(p_request_id uuid, p_user_id uuid) RETURNS jsonb` RPC
- [ ] Atomically updates the request + inserts the friendship row

### 3.4 Bet creation multi-step cleanup — consider an RPC

**Current:** `betProposalService.ts` does insert → announcement → mode config store, with manual cleanup-on-failure logic (delete bet if announcement fails, delete bet+announcement if config fails).

- [ ] Consider a `create_bet_proposal(...)` RPC for the DB rows (bet_proposals + system_messages), then store mode config in Redis after
- [ ] At minimum, add a database-level `ON DELETE CASCADE` from `messages` to `bet_proposals` (via `bet_id` FK) so deleting the bet auto-cleans the message row

---

## 4. RLS Hardening

### 4.1 Missing RLS policies

| Table | Missing policy | Risk | Action |
|---|---|---|---|
| `resolution_history` | No INSERT policy for anon/authenticated | 🟢 Low (server uses service_role) | Add explicit `INSERT` deny policy: `USING (false)` — defense in depth |
| `resolution_history` | No UPDATE policy | 🟢 Low | Add explicit `UPDATE` deny: `USING (false)` |
| `resolution_history` | No DELETE policy | 🟢 Low | Add explicit `DELETE` deny: `USING (false)` |
| `friend_requests` | No DELETE policy | 🟡 Medium | Add `DELETE` policy allowing sender to delete their own pending requests (or deny all) |
| `users` | No INSERT policy (besides trigger) | 🟢 Low | Already handled by `handle_new_user()` trigger + auth, but add explicit `INSERT` deny for defense in depth |
| `users` | No DELETE policy | 🟢 Low | Add explicit `DELETE` deny: `USING (false)` |

### 4.2 Overly permissive policies

| Table | Policy | Issue | Action |
|---|---|---|---|
| `users` | `Allow authenticated read access to usernames` | `auth.role() = 'authenticated'` exposes ALL user rows (user_id, username, email, timestamps) to any logged-in user | Restrict columns: create a view `public.user_profiles` exposing only `user_id, username` and grant SELECT on that, or narrow the policy to only return rows the user is related to |
| `text_messages` | `Users can update their own text messages` | Allows message editing — is this intentional? Could be used to retroactively change message content | If not needed, change to `USING (false)` |
| `text_messages` | `Users can delete their own text messages` | Allows message deletion — is this intentional? | If not needed, change to `USING (false)` |
| `table_members` | `allow_table_settlement_updates` | Allows host to update ANY column on table_members (including `user_id`, `table_id`) | Add a `WITH CHECK` that restricts which columns can change: `(bust_balance IS NOT NULL AND push_balance IS NOT NULL AND sweep_balance IS NOT NULL)` or use an immutable-fields trigger |

### 4.3 Duplicate/redundant RLS policies

| Table | Policies | Issue |
|---|---|---|
| `table_members` | Two DELETE policies: "Allow hosts to remove members" + "Allow members to leave tables" | Not a problem (OR'd together), but verify intent |
| `users` | Two SELECT policies: "Allow authenticated read access" + "Allow individual read access to own profile" | The first already covers the second — remove the narrower one or restrict the broader one |

---

## 5. Trigger & RPC Improvements

### 5.1 Duplicate trigger: `trg_set_bet_close_time` and `trg_set_bet_close_time_before_insert`

Both fire `BEFORE INSERT` on `bet_proposals` and call `set_bet_close_time()`. The first also fires on UPDATE. This means the function runs **twice** on every INSERT.

- [ ] Drop `trg_set_bet_close_time_before_insert` — it's redundant with the INSERT portion of `trg_set_bet_close_time`

### 5.2 `transition_bet_to_pending` pre-calculates payouts that get re-calculated

The RPC calculates `bust_balance` and `sweep_balance` adjustments during the `active → pending` transition. Then when `winning_choice` is set and the bet goes to `resolved`, the `apply_bet_payouts` trigger recalculates and applies final payouts.

- [ ] Verify the sweep_balance math is consistent between the two paths
- [ ] Consider moving the pending-phase balance escrow into its own clearly named function for clarity
- [ ] Add comments explaining the two-phase payout model (escrow at pending → finalize at resolve)

### 5.3 `touch_table_last_activity` fires on many tables — performance concern

This trigger fires on INSERT/UPDATE for: `bet_participations`, `bet_proposals`, `messages`, `system_messages`, `table_members`, `text_messages`. Each does a full `UPDATE tables SET last_activity_at = ...`.

- [ ] Consider debouncing: only update if `last_activity_at` is older than N seconds (avoids write amplification during rapid chat)
- [ ] Add an index on `tables(table_id)` if not already the PK index (it is — this is fine)

### 5.4 `create_system_message_on_bet_washed` may duplicate wash messages

Both the trigger `trg_bet_proposals_washed_msg` and `washService.ts::createWashSystemMessage()` create system messages when a bet is washed.

- [ ] Audit whether both fire for the same wash event — if yes, users see duplicate "Bet #xxx washed" messages
- [ ] Consolidate: let the trigger handle all wash messages, remove the server-side `createWashSystemMessage()`

### 5.5 Missing `SECURITY DEFINER` consistency

Some functions use `SECURITY DEFINER` + `SET search_path TO 'public'` (good), others use `SECURITY DEFINER` without `SET search_path` (mild risk), and some don't use it at all.

- [ ] `set_bet_resolved_on_winning_choice()` — no `SECURITY DEFINER`, no `SET search_path`. Add both.
- [ ] `enforce_immutable_bet_participation_fields()` — no `SECURITY DEFINER`. This is a BEFORE trigger so it's less risky, but add `SET search_path` for consistency.
- [ ] `is_bet_open()` — no `SECURITY DEFINER`. Since it's used in RLS policies, ensure it runs in the correct search path.
- [ ] `is_table_member()` — no `SECURITY DEFINER` but `is_user_member_of_table()` IS `SECURITY DEFINER`. These are near-identical functions — consolidate to one.

### 5.6 Duplicate helper functions: `is_table_member` vs `is_user_member_of_table`

Both do `EXISTS (SELECT 1 FROM table_members WHERE table_id = ... AND user_id = ...)`.

- [ ] Pick one, drop the other, and update all references (RLS policies, triggers, server code)

---

## 6. Schema & Constraint Improvements

### 6.1 Missing indexes (query performance)

- [ ] `bet_proposals(table_id, bet_status)` — used in settlement check, catchup cycle, message queries
- [ ] `bet_participations(bet_id, user_guess)` — used heavily in payout calculations
- [ ] `bet_participations(user_id, participation_time DESC)` — used in ticket pagination
- [ ] `messages(table_id, posted_at DESC, message_id DESC)` — used in cursor-based chat pagination
- [ ] `friend_requests(sender_user_id, status)` and `friend_requests(receiver_user_id, status)` — used in friend request lookups
- [ ] `friends(user_id1)` and `friends(user_id2)` — used in friendship queries with OR filters

### 6.2 Missing constraints

- [ ] `bet_proposals.wager_amount` — Add `CHECK (wager_amount > 0)` (currently only checks `% 0.01 = 0`)
- [ ] `table_members` — Add `UNIQUE (table_id, user_id)` if not present (prevents duplicate memberships)
- [ ] `bet_participations` — Add `UNIQUE (bet_id, user_id)` if not present (prevents double-accepting)
- [ ] `friend_requests` — Add `CHECK (sender_user_id <> receiver_user_id)` (prevent self-requests)
- [ ] `text_messages.message_text` — Add `CHECK (length(message_text) <= 1000)` (server validates at 1000 chars but DB doesn't enforce)

### 6.3 `table_settlements` table is referenced in code but not in schema.json

The server's `tableSettlementService.ts` inserts into `table_settlements` but this table isn't in the schema dump.

- [ ] Verify the table exists in production
- [ ] If it does, add RLS policies (deny all client-side writes, allow service_role only)
- [ ] Add it to the schema documentation

### 6.4 `friends.user_id1` / `user_id2` default to `gen_random_uuid()`

This is wrong — these should have no default. A friendship should always be explicitly created with real user IDs.

- [ ] Remove `DEFAULT gen_random_uuid()` from both columns
- [ ] Same for `table_members.table_id` and `table_members.user_id` which also have `gen_random_uuid()` defaults — these should always be explicitly provided

---

## 7. Realtime Subscription Improvements

### 7.1 Unfiltered `bet_proposals` subscription in `useTickets.ts`

**File:** `client/src/features/bets/hooks/useTickets.ts`

```ts
{ event: '*', schema: 'public', table: 'bet_proposals' }  // no filter!
```

This subscribes to ALL bet_proposal changes across ALL tables, then filters client-side. On a busy platform this will be very noisy.

- [ ] Use Supabase's `filter` parameter to scope to relevant `table_id` values, or
- [ ] Subscribe per-table instead of globally
- [ ] At minimum, filter by `bet_id` using `.in()` if Supabase Realtime supports it

### 7.2 Channel name collisions

Channel names like `table_members:${tableId}` are fine for single-user sessions, but if a user has the app open in multiple tabs, channels may collide.

- [ ] Add a random suffix or session ID to channel names to prevent cross-tab interference

### 7.3 Missing error recovery on subscriptions

`handleSubscriptionStatus` logs errors but doesn't retry. If a channel hits `TIMED_OUT` the subscription is dead.

- [ ] Add exponential-backoff reconnection logic
- [ ] Consider a subscription manager that monitors channel health

---

## 8. General Architecture Improvements

### 8.1 Client creates per-request Supabase clients on server

**File:** `server/src/middleware/auth.ts`

Every request creates a new `createClient()` for the user's token. This is fine per Supabase's docs but:
- [ ] Consider pooling or caching these per-token (with TTL matching JWT expiry)
- [ ] The admin client is already a singleton — document this pattern difference

### 8.2 Server has both user-scoped and admin Supabase clients — inconsistent usage

Some server code (e.g., `betController.validateBet`) uses `supabaseAdmin` for reads that should respect RLS (like checking bet existence), then uses it again for privileged writes. This blurs the security boundary.

- [ ] Establish a convention: use `req.supabase` (user-scoped) for reads, `supabaseAdmin` only for privileged writes
- [ ] Audit all `getSupabaseAdmin()` usages in controllers — some could use `req.supabase` instead

### 8.3 No database migration system

Changes to triggers, functions, RLS policies, and schema are apparently managed manually or via the Supabase dashboard.

- [ ] Adopt a migration system: Supabase CLI `supabase db diff` / `supabase migration new`, or use a tool like `dbmate` / `prisma migrate`
- [ ] Version-control all SQL in a `supabase/migrations/` directory

### 8.4 Missing `ON DELETE CASCADE` / referential actions

- [ ] `bet_participations.bet_id → bet_proposals.bet_id` — should CASCADE on delete (cleanup on bet deletion)
- [ ] `messages.bet_id → bet_proposals.bet_id` — should CASCADE (cleanup message row when bet deleted)
- [ ] `messages.text_message_id → text_messages.text_message_id` — should CASCADE
- [ ] `messages.system_message_id → system_messages.system_message_id` — should CASCADE
- [ ] `table_members.table_id → tables.table_id` — should CASCADE (cleanup when table deleted)

### 8.5 Timestamp consistency

- [ ] Some tables use `now()` (transaction time), others use `timezone('utc', now())`. Pick one convention.
- [ ] `participation_time` is set from the client's `new Date().toISOString()` in `acceptBetProposal` — use the DB default `now()` instead

### 8.6 Error exposure

- [ ] Several controllers return raw Supabase error messages to the client (e.g., `res.status(500).json({ error: e.message })`). Sanitize error messages in production to avoid leaking internal details.

### 8.7 `isUsernameTaken` query is case-sensitive

**File:** `client/src/data/repositories/socialRepository.ts`

`.eq('username', username)` is case-sensitive. Users could register `Alice` and `alice` as different usernames.

- [ ] Add a case-insensitive unique index: `CREATE UNIQUE INDEX idx_users_username_lower ON users (lower(username))`
- [ ] Or use `.ilike()` in the query

---

---

## Migration Phases

> Each phase is designed to be **independently shippable**. Complete one, deploy, verify, move to the next. Earlier phases unblock later ones but no phase depends on all prior phases being 100% done — you can interleave where it makes sense.

---

### Phase 1 — Foundation: Migrations System + Schema Safety Net

**Goal:** Get all SQL under version control so every subsequent phase produces reviewable, rollback-able migration files instead of ad-hoc dashboard edits.

**Duration:** ~1 day

| # | Task | Refs | Status |
|---|---|---|---|
| 1 | `npx supabase init` at repo root, link to your project | §8.3 | ✅ Done |
| 2 | Baseline migration generated from schema/functions/triggers/RLS dumps | §8.3 | ✅ Done — `20260225000000_baseline.sql` |
| 3 | Commit the `supabase/` directory (seed, migrations, config) | §8.3 | ⬜ Ready to commit |
| 4 | Add `supabase db push` (or `supabase migration up`) to your deploy pipeline | §8.3 | ⬜ |
| 5 | Verify `table_settlements` exists in prod; if not, create migration for it + add RLS (deny all client writes) | §6.3 | ✅ Done — `20260225000001_create_table_settlements.sql` |

**Verification:** `supabase db diff` returns empty after push — DB matches migrations.

**Deployment steps for production:**
1. Link your project: `npx supabase link --project-ref <YOUR_PROJECT_REF>`
2. Mark the baseline as already applied: `npx supabase migration repair --status applied 20260225000000`
3. If `table_settlements` already exists in prod, also: `npx supabase migration repair --status applied 20260225000001`
4. If `table_settlements` does NOT exist in prod: `npx supabase db push` to apply it
5. Verify: `npx supabase migration list` — all migrations should show as applied

---

### Phase 2 — Critical Client → Server Migrations (Writes)

**Goal:** Eliminate the most dangerous client-side Supabase mutation calls. Every write goes through the Express server for validation, rate-limiting, and atomicity.

**Duration:** ~3-4 days

| # | Task | Refs |
|---|---|---|
| 1 | **Settlement:** Delete `settleTable()` from `tablesRepository.ts`. Client calls `POST /api/tables/:tableId/settle` (already exists). Write a test that verifies the client can't settle via direct Supabase calls anymore. | §1.1 |
| 2 | **Create table:** New `POST /api/tables` endpoint. Server inserts into `tables` + `table_members` atomically (service-role or RPC). Delete `createTable()` from `tablesRepository.ts`. Client calls `fetchJSON('/api/tables', ...)`. | §1.2 |
| 3 | **Accept bet:** New `POST /api/bets/:betId/accept` endpoint. Server validates membership, bet-open status, inserts `bet_participations` with `participation_time = now()`. Delete `acceptBetProposal()` from `betsRepository.ts`. | §1.3 |
| 4 | **Change guess:** New `PATCH /api/bets/:betId/guess` endpoint. Server fetches mode config, validates guess is a valid option, updates `bet_participations`. Remove direct update from `useTickets.ts`. | §1.4 |
| 5 | Add rate-limiting to the new accept + guess endpoints (reuse existing `getBetRateLimiter`). | §1.3, §1.4 |
| 6 | Update all client call sites: `tablesRepository`, `betsRepository`, `useTickets` to use `fetchJSON` instead of `supabase.from(...)`. | §2 |

**Verification:** `grep -r "supabase\.from.*insert\|supabase\.from.*update\|supabase\.from.*delete" client/src/` returns zero mutation hits (read-only queries are fine).

---

### Phase 3 — Atomic RPCs (Server → Supabase)

**Goal:** Replace multi-step server-side writes with single-round-trip PL/pgSQL functions, eliminating partial-failure states.

**Duration:** ~2-3 days

| # | Task | Refs |
|---|---|---|
| 1 | **`settle_table(p_table_id, p_user_id)` RPC:** Validate host, check no active/pending bets, snapshot balances, zero all, insert `table_settlements` — all in one transaction. Server calls `supabase.rpc(...)`. | §3.1 |
| 2 | **`create_table_with_host(p_table_name, p_host_user_id)` RPC:** Insert into `tables`, insert host into `table_members`, return the new table row. *OR* add an `AFTER INSERT ON tables` trigger that auto-adds the host member. Pick one. | §3.2 |
| 3 | **`accept_friend_request(p_request_id, p_user_id)` RPC:** Update `friend_requests` to accepted + insert `friends` row atomically. Update `friendController.ts` to call this. | §3.3 |
| 4 | Add `ON DELETE CASCADE` to critical foreign keys: `bet_participations.bet_id`, `messages.bet_id`, `messages.text_message_id`, `messages.system_message_id`, `table_members.table_id`. | §8.4 |
| 5 | Write migration files for all of the above. | §8.3 |

**Verification:** Manually test each RPC via `supabase rpc` or a test script. Kill server mid-settle — confirm balances are either fully zeroed or fully untouched (atomicity).

---

### Phase 4 — Medium-Priority Client → Server Migrations

**Goal:** Move the remaining client-side writes to the server. Lower urgency than Phase 2 because RLS already provides basic protection, but still important for validation + rate-limiting.

**Duration:** ~2 days

| # | Task | Refs |
|---|---|---|
| 1 | **Add member:** `POST /api/tables/:tableId/members` — validate target user exists, optionally require friendship. | §1.6 |
| 2 | **Remove member:** `DELETE /api/tables/:tableId/members/:userId` — validate host or self. | §1.6 |
| 3 | **Remove friend:** `DELETE /api/friends/:friendUserId` — server-side UUID validation + `assertUuid`. | §1.5 |
| 4 | **Update username:** `PATCH /api/users/me/username` — server-side uniqueness check (case-insensitive), length validation. | §2 |
| 5 | Remove all corresponding direct Supabase calls from `tablesRepository.ts`, `socialRepository.ts`. | §2 |

**Verification:** Full E2E smoke test of tables flow (create → add member → remove member) and social flow (add friend → remove friend → change username). All go through `/api/...`.

---

### Phase 5 — RLS Hardening

**Goal:** Lock down every table so there are no "missing policy" gaps, and tighten overly-broad policies.

**Duration:** ~1 day

| # | Task | Refs |
|---|---|---|
| 1 | **Deny policies:** Add explicit INSERT/UPDATE/DELETE deny (`USING (false)`) to: `resolution_history`, `users` (INSERT + DELETE). | §4.1 |
| 2 | **`friend_requests` DELETE:** Add policy — sender can delete own pending requests, deny all others. | §4.1 |
| 3 | **`users` SELECT:** Narrow "Allow authenticated read access to usernames" to only expose `user_id, username`. Create a `user_profiles` view or restrict the policy scope. | §4.2 |
| 4 | **`text_messages` UPDATE/DELETE:** Decide if message editing/deleting is intentional. If not, change both to `USING (false)`. | §4.2 |
| 5 | **`table_members` UPDATE:** Add an immutable-fields trigger (like `enforce_immutable_bet_participation_fields`) for `table_id` and `user_id` columns, or tighten the WITH CHECK. | §4.2 |
| 6 | Remove the duplicate `users` SELECT policy (the narrow one is covered by the broad one). | §4.3 |
| 7 | Write all as migration files. | §8.3 |

**Verification:** For each table, try the forbidden operation via the anon key in a test script — confirm it's rejected. `SELECT * FROM users` as anon should only return `user_id, username`.

---

### Phase 6 — Trigger & Function Cleanup

**Goal:** Eliminate duplicate/redundant triggers, consolidate helper functions, fix `SECURITY DEFINER` gaps.

**Duration:** ~1 day

| # | Task | Refs |
|---|---|---|
| 1 | Drop `trg_set_bet_close_time_before_insert` — it's fully redundant with `trg_set_bet_close_time`. | §5.1 |
| 2 | Consolidate `is_table_member` and `is_user_member_of_table` into one function. Update all RLS policies, triggers, and server code that reference the dropped one. | §5.5, §5.6 |
| 3 | Add `SECURITY DEFINER` + `SET search_path TO 'public'` to: `set_bet_resolved_on_winning_choice`, `enforce_immutable_bet_participation_fields`, `is_bet_open`, `set_bet_close_time`. | §5.5 |
| 4 | **Duplicate wash messages:** Audit `trg_bet_proposals_washed_msg` vs `washService.ts::createWashSystemMessage()`. If both fire, remove the server-side one and let the trigger be the single source. | §5.4 |
| 5 | Add explanatory comments to `transition_bet_to_pending` + `apply_bet_payouts` documenting the two-phase escrow model. | §5.2 |
| 6 | Write all as migration files. | §8.3 |

**Verification:** Create a bet → let it close → wash it. Confirm exactly one "Bet washed" system message appears (not two). Run `\df` in psql — confirm no orphan functions.

---

### Phase 7 — Schema & Constraint Hardening

**Goal:** Add missing indexes, constraints, and fix schema defaults to prevent data anomalies.

**Duration:** ~1 day

| # | Task | Refs |
|---|---|---|
| 1 | **Indexes:** Add composite indexes: `bet_proposals(table_id, bet_status)`, `bet_participations(bet_id, user_guess)`, `bet_participations(user_id, participation_time DESC)`, `messages(table_id, posted_at DESC, message_id DESC)`, `friend_requests(sender_user_id, status)`, `friend_requests(receiver_user_id, status)`. | §6.1 |
| 2 | **Unique constraints:** `UNIQUE (table_id, user_id)` on `table_members`, `UNIQUE (bet_id, user_id)` on `bet_participations`. | §6.2 |
| 3 | **Check constraints:** `wager_amount > 0`, `sender_user_id <> receiver_user_id` on `friend_requests`, `length(message_text) <= 1000` on `text_messages`. | §6.2 |
| 4 | **Fix defaults:** Remove `DEFAULT gen_random_uuid()` from `friends.user_id1`, `friends.user_id2`, `table_members.table_id`, `table_members.user_id`. | §6.4 |
| 5 | **Case-insensitive username:** `CREATE UNIQUE INDEX idx_users_username_lower ON users (lower(username))`. Update `isUsernameTaken` to use `.ilike()`. | §8.7 |
| 6 | **Timestamp convention:** Pick `now()` everywhere (transaction time in UTC). Remove `timezone('utc', now())` variants for consistency. | §8.5 |
| 7 | Write all as migration files. Test on a staging copy first — unique constraints may fail if duplicates already exist. | §8.3 |

**Verification:** Try inserting a duplicate `(table_id, user_id)` into `table_members` — should fail. Try a wager of `0` — should fail. `EXPLAIN ANALYZE` on the chat pagination query — should use the new index.

---

### Phase 8 — Realtime & Subscription Improvements

**Goal:** Reduce Realtime noise, add resilience to subscriptions, prevent cross-tab channel collisions.

**Duration:** ~1-2 days

| # | Task | Refs |
|---|---|---|
| 1 | **Filter `useTickets` subscription:** Replace the unfiltered `bet_proposals` subscription with per-table scoped channels, or filter server-side by adding `bet_id` list to the filter. | §7.1 |
| 2 | **Channel name uniqueness:** Append a session/tab ID (e.g., `crypto.randomUUID()` per page load) to all channel names. | §7.2 |
| 3 | **Reconnection logic:** Add exponential-backoff retry to `handleSubscriptionStatus` when status is `TIMED_OUT` or `CHANNEL_ERROR`. | §7.3 |
| 4 | **`touch_table_last_activity` debounce:** Update the trigger to skip the UPDATE if `last_activity_at > now() - interval '5 seconds'`. | §5.3 |

**Verification:** Open two tabs to the same table — confirm independent subscriptions. Kill the Supabase Realtime connection (network toggle) — confirm it reconnects. Watch the `tables` UPDATE rate during rapid chatting — should be ≤1 per 5 seconds.

---

### Phase 9 (Ongoing) — Server Hygiene & Observability

**Goal:** Clean up architectural inconsistencies and improve prod safety.

**Duration:** Ongoing / as-needed

| # | Task | Refs |
|---|---|---|
| 1 | **Error sanitization:** Wrap all controller error responses in a helper that strips internal Supabase error details in production (keep them in dev). | §8.6 |
| 2 | **Admin client audit:** Grep all `getSupabaseAdmin()` usages in controllers. Replace with `req.supabase` where the operation should respect RLS. Reserve admin for privileged writes only. | §8.2 |
| 3 | **Document the admin vs user-scoped pattern** in `SYSTEM_ARCHITECTURE.md`. | §8.1, §8.2 |
| 4 | **Supabase client caching:** Optionally cache user-scoped clients per-token with TTL. Benchmark to see if this matters. | §8.1 |

**Verification:** Trigger a 500 error in prod — confirm the response body does not contain PostgreSQL error details. Grep for `getSupabaseAdmin` — each usage should have a comment justifying why admin access is needed.

---

### Phase Summary

| Phase | Focus | Est. Time | Blocks |
|---|---|---|---|
| **1** | Migration system + baseline | ~1 day | — |
| **2** | Critical client → server writes | ~3-4 days | — |
| **3** | Atomic RPCs | ~2-3 days | Phase 1 |
| **4** | Remaining client → server writes | ~2 days | Phase 2 |
| **5** | RLS hardening | ~1 day | Phase 1 |
| **6** | Trigger/function cleanup | ~1 day | Phase 1 |
| **7** | Schema + constraints | ~1 day | Phase 1 |
| **8** | Realtime improvements | ~1-2 days | — |
| **9** | Server hygiene (ongoing) | ongoing | — |
| | **Total estimated** | **~13-16 days** | |

Phases 2 + 3 are the highest-value work. Phases 5-7 can be done in parallel by a second contributor. Phase 8 is independent and can slot in whenever.

---

*End of audit.*
