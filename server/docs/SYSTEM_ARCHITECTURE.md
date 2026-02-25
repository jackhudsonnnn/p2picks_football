# P2Picks — System Architecture

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [High-Level Architecture](#3-high-level-architecture)
4. [Database Layer (Supabase / PostgreSQL)](#4-database-layer-supabase--postgresql)
5. [Server Architecture](#5-server-architecture)
6. [Client Architecture](#6-client-architecture)
7. [Bet Lifecycle](#7-bet-lifecycle)
8. [Mode System](#8-mode-system)
9. [League Data Pipeline](#9-league-data-pipeline)
10. [Realtime & Subscriptions](#10-realtime--subscriptions)
11. [Authentication & Authorization](#11-authentication--authorization)
12. [Infrastructure Services](#12-infrastructure-services)
13. [Data Flow Walkthrough](#13-data-flow-walkthrough)
14. [Database Migrations](#14-database-migrations)
15. [DevOps & Deployment](#15-devops--deployment)
16. [Directory Reference](#16-directory-reference)

---

## 1. System Overview

P2Picks is a peer-to-peer sports-betting prediction platform where users create **tables** (private groups), propose **bets** tied to live sporting events, and compete for virtual currency (**bust / push / sweep** balances). The system supports multiple leagues (NFL, NBA, and the custom U2Pick league) and multiple bet **modes** — each with unique validation, resolution, and payout logic.

### Core Concepts

| Concept | Description |
|---|---|
| **Table** | A private group of users. All bets, messages, and balances are scoped to a table. |
| **Bet Proposal** | A question posed to the table (e.g., "Who will score the next touchdown?"). Has a wager, a time limit, and a game reference. |
| **Bet Participation** | A user's answer (guess) to a bet proposal. |
| **Mode** | A category of bet logic — defines what questions can be asked, how they are validated, and how the winner is determined. |
| **League** | The sport/competition a mode belongs to (NFL, NBA, U2Pick). |
| **Bust / Push / Sweep** | Per-member balances on each table. Bust = current holdings, Push = net profit/loss, Sweep = contingent/escrowed value during pending bets. |
| **Ticket** | A historical record of a user's bet results (win/loss/wash). |

---

## 2. Technology Stack

### Server

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript 5.8 (strict) |
| Framework | Express 4.19 |
| Database | Supabase (hosted PostgreSQL) via `@supabase/supabase-js` ^2.45 |
| Cache / Queue | Redis (ioredis ^5.4) + BullMQ ^5.66 |
| Validation | Zod ^4.3 (environment config, request schemas) |
| Dev Server | ts-node-dev |
| Testing | Vitest |

### Client

| Layer | Technology |
|---|---|
| UI | React 18.3 + TypeScript 5.8 (strict) |
| Build | Vite 6.3 |
| Routing | React Router v7 |
| Server State | TanStack Query v5 (react-query) |
| Database Client | Supabase JS ^2.49 (anon key, Realtime) |
| Styling | Tailwind CSS 4 |
| Testing | Vitest 4.0 |

### Infrastructure

| Concern | Technology |
|---|---|
| Auth | Supabase Auth (Google OAuth) |
| Realtime | Supabase Realtime (PostgreSQL changes) |
| Job Queue | BullMQ on Redis |
| Rate Limiting | Redis-backed sliding window counters |
| Logging | pino ^10.3 structured JSON logger (server); `createLogger` (client) |
| Metrics | Lightweight Prometheus registry (server); exposed at `/metrics` |

---

## 3. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          CLIENT (React SPA)                      │
│                                                                  │
│  main.tsx → QueryProvider → AuthProvider → BrowserRouter → App   │
│                                                                  │
│  Features:  auth/  bets/  table/  social/                        │
│  Data:      repositories → restClient (HTTP) → Server API        │
│             supabaseClient → Supabase Realtime (WebSocket)       │
│  State:     TanStack Query (staleTime 30s, gcTime 5min)          │
└──────────────┬────────────────────────┬──────────────────────────┘
               │  REST API (Bearer JWT) │  Supabase Realtime (WS)
               ▼                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                       SERVER (Express)                           │
│                                                                  │
│  Middleware: requestId → auth → validateParams/Body → idempotency → rateLimitHeaders → errorHandler  │
│  Routes:    /api/v1/* (canonical), /api/* (backward-compat alias) │
│  Controllers → Services → Repositories → Supabase (PostgreSQL)   │
│                                                                  │
│  Background:                                                     │
│    • Mode Runtime (validators per mode per league)               │
│    • Bet Lifecycle Service (Active→Pending timer)                │
│    • Resolution Queue (BullMQ — set_winning_choice, wash, hist.) │
│    • Data Ingest (NFL + NBA ESPN polling)                        │
└──────────────┬─────────────┬─────────────┬───────────────────────┘
               │             │             │
               ▼             ▼             ▼
         ┌──────────┐  ┌──────────┐  ┌──────────┐
         │ Supabase │  │  Redis   │  │  ESPN    │
         │ (Postgres│  │ (cache,  │  │  APIs    │
         │  + Auth  │  │  queues, │  │ (NFL/NBA │
         │  + RLS)  │  │  stores) │  │  feeds)  │
         └──────────┘  └──────────┘  └──────────┘
```

---

## 4. Database Layer (Supabase / PostgreSQL)

### 4.1 Schema

Nine application tables, all with UUID primary keys and `timestamptz` timestamps:

```
users
 ├── user_id (PK, UUID)
 ├── username (text, nullable)
 ├── email (text)
 ├── created_at, updated_at

tables
 ├── table_id (PK, UUID)
 ├── table_name (text)
 ├── host_user_id (FK → users)
 ├── created_at, last_activity_at

table_members
 ├── member_id (PK, UUID)
 ├── table_id (FK → tables)
 ├── user_id (FK → users)
 ├── joined_at
 ├── bust_balance (numeric(12,2), default 0, CHECK >= 0)
 ├── push_balance (numeric(12,2), default 0)
 ├── sweep_balance (numeric(12,2), default 0)

bet_proposals
 ├── bet_id (PK, UUID)
 ├── table_id (FK → tables)
 ├── proposer_user_id (FK → users)
 ├── wager_amount (numeric)
 ├── time_limit_seconds (int)
 ├── close_time (timestamptz)
 ├── proposal_time (timestamptz, default now())
 ├── bet_status (enum: active | pending | resolved | washed)
 ├── winning_choice (text, nullable)
 ├── resolution_time (timestamptz, nullable)
 ├── mode_key (text)
 ├── league (enum: NFL | NBA | ... | U2Pick)
 ├── league_game_id (text)
 ├── description (text)

bet_participations
 ├── participation_id (PK, UUID)
 ├── bet_id (FK → bet_proposals)
 ├── table_id (FK → tables)
 ├── user_id (FK → users)
 ├── user_guess (text, default 'No Entry')
 ├── participation_time (timestamptz)

messages (unified feed — polymorphic)
 ├── message_id (PK, UUID)
 ├── table_id (FK → tables)
 ├── message_type (enum: chat | system | bet_proposal)
 ├── text_message_id (FK → text_messages, nullable)
 ├── system_message_id (FK → system_messages, nullable)
 ├── bet_id (FK → bet_proposals, nullable)
 ├── posted_at, created_at

text_messages
 ├── text_message_id (PK, UUID)
 ├── table_id (FK → tables)
 ├── user_id (FK → users)
 ├── message_text (text)
 ├── posted_at

system_messages
 ├── system_message_id (PK, UUID)
 ├── table_id (FK → tables)
 ├── message_text (text)
 ├── generated_at

resolution_history
 ├── resolution_history_id (PK, UUID)
 ├── bet_id (FK → bet_proposals)
 ├── event_type (text: payout | wash_refund | status_transition | washed
 │                     | resolve_or_wash_live_info | bet_poke_spawned
 │                     | bet_poke_origin | manual_validation | resolution_failed
 │                     | <mode>_baseline | <mode>_result)
 ├── payload (jsonb)
 ├── created_at
```

#### Event Types Reference

| `event_type` | When written | Payload highlights |
|---|---|---|
| `payout` | Trigger: `apply_bet_payouts()` on resolve | Payout distribution details |
| `wash_refund` | Trigger: `refund_bet_points_on_wash()` | Refund amounts |
| `status_transition` | Bet lifecycle transitions | Previous/new status |
| `washed` | `washBetWithHistory` RPC | Wash reason, mode label |
| `resolve_or_wash_live_info` | `captureLiveInfoSnapshot()` on resolve/wash | `{ modeKey, modeLabel, fields[], capturedAt, trigger, outcomeDetail }` — frozen snapshot of the Information Modal data |
| `bet_poke_spawned` | `recordBetPokeLink()` | `{ new_bet_id }` |
| `bet_poke_origin` | `recordBetPokeLink()` | `{ source_bet_id }` |
| `manual_validation` | `betController.validateBet()` | `{ validated_by, winning_choice }` |
| `resolution_failed` | DLQ handler in `resolutionQueue` | `{ jobId, type, error, attempts }` |
| `<mode>_baseline` | Validator baseline capture | Mode-specific baseline data |
| `<mode>_result` | Validator resolution | Mode-specific evaluation data |

### 4.2 Custom Enum Types

| Enum | Values |
|---|---|
| `bet_lifecycle_status` | `active`, `pending`, `resolved`, `washed` |
| `league` | `NFL`, `NBA`, `MLB`, `NHL`, `NCAAF`, `U2Pick` |
| `message_type` | `chat`, `system`, `bet_proposal` |
| `friend_request_status` | `pending`, `accepted`, `rejected` |

### 4.2a Indexes

Key non-unique indexes (unique indexes exist on all PKs and explicit UNIQUE constraints):

| Index | Columns | Purpose |
|---|---|---|
| `idx_bet_proposals_table_id_status` | `bet_proposals(table_id, bet_status)` | Lifecycle service — active bets per table; member view policy |
| `idx_bet_proposals_close_time` | `bet_proposals(close_time)` | Overdue-bet scan in `set_bets_pending` |
| `idx_bet_proposals_status` | `bet_proposals(bet_status)` | Filter by lifecycle status |
| `idx_bet_participations_bet_id_guess` | `bet_participations(bet_id, user_guess)` | Payout aggregation in trigger functions |
| `bet_participations_user_time_id_desc` | `bet_participations(user_id, participation_time DESC, participation_id DESC)` | Tickets page — per-user participation history |
| `idx_messages_table_posted_at` | `messages(table_id, posted_at DESC, message_id DESC)` | Chat pagination |
| `idx_friend_requests_sender_status` | `friend_requests(sender_user_id, status)` | "My pending requests" queries |
| `idx_friend_requests_receiver_status` | `friend_requests(receiver_user_id, status)` | "Incoming requests" queries |
| `idx_resolution_history_bet_id_created_at` | `resolution_history(bet_id, created_at DESC)` | Resolution event history per bet |
| `tables_last_activity_desc` | `tables(last_activity_at DESC, table_id DESC)` | Tables list — sorted by activity |

**Username uniqueness:** `idx_users_username_lower` — `UNIQUE` on `lower(username) WHERE username IS NOT NULL`. Enforces case-insensitive username uniqueness at the DB level. The `isUsernameTaken()` client function and server `updateUsername` handler both use case-insensitive comparison (`.ilike()`) to leverage this index.

### 4.2b Check Constraints

Key business-rule constraints beyond NOT NULL:

| Table | Constraint | Rule |
|---|---|---|
| `bet_proposals` | `bet_proposals_wager_positive` | `wager_amount > 0` |
| `bet_proposals` | `time_limit_seconds` range | `15 ≤ time_limit_seconds ≤ 120` |
| `bet_proposals` | `wager_amount` precision | `wager_amount % 0.01 = 0` (2 d.p. max) |
| `friend_requests` | `friend_requests_no_self_request` | `sender_user_id <> receiver_user_id` |
| `text_messages` | `text_messages_length_limit` | `length(message_text) <= 1000` |
| `friends` | `check_different_users` | `user_id1 <> user_id2` |
| `table_members` | `bust_balance` precision | `bust_balance % 0.01 = 0` |
| `messages` | `messages_type_match` | Polymorphic type/FK consistency check |

### 4.3 Key RPC Functions

| Function | Security | Purpose |
|---|---|---|
| `transition_bet_to_pending(p_bet_id)` | `SECURITY DEFINER`, service-role only | **Phase 1 escrow** — atomically moves active→pending. Validates close_time elapsed and ≥2 distinct guesses; washes immediately if not. Debits `bust_balance` (wager) and credits `sweep_balance` (contingent payout share) per participant. |
| `set_bets_pending()` | `SECURITY DEFINER` | Bulk catchup: iterates all overdue active bets and calls `transition_bet_to_pending` for each. |
| `apply_bet_payouts()` | `SECURITY DEFINER` | **Phase 2 escrow** — trigger on `bet_proposals` UPDATE when status → `resolved`. Restores winners' `bust_balance` + `push_balance`; clears losers' `sweep_balance` contingent. Remainder cents distributed randomly. |
| `refund_bet_points_on_wash()` | `SECURITY DEFINER` | Trigger on `pending → washed`. Reverses Phase 1 escrow: returns wager to `bust_balance`, clears `sweep_balance`. |
| `resolution_enforce_no_winner_wash()` | `SECURITY DEFINER` | BEFORE UPDATE. If `resolved` bet has no participants on `winning_choice`, force-washes the bet instead. |
| `set_bet_resolved_on_winning_choice()` | `SECURITY DEFINER` | BEFORE UPDATE. When `winning_choice` set (non-null), auto-flips status to `resolved`. |
| `handle_new_user()` | `SECURITY DEFINER` | Trigger on `auth.users` INSERT → creates row in `public.users`. |
| `is_user_member_of_table(table_id, user_id)` | `STABLE SECURITY DEFINER` | Canonical membership helper used by all RLS policies. (Replaces the removed `is_table_member` which lacked `SECURITY DEFINER`.) |
| `is_bet_open(bet_id)` | `STABLE SECURITY DEFINER` | Returns true if bet is active and before `close_time`. |
| `set_bet_close_time()` | `SECURITY DEFINER` | Trigger function — computes `close_time = proposal_time + time_limit_seconds`. |
| `wash_bet_with_history(bet_id, event_type, payload)` | `SECURITY DEFINER` | Atomically washes a pending bet and records a `resolution_history` entry in one transaction. Used by `washService.ts`. |
| `enforce_immutable_bet_participation_fields()` | `SECURITY DEFINER` | Prevents modification of `bet_id`, `table_id`, `user_id` on participations. |

#### Two-Phase Escrow Model

Virtual currency is managed across two phases to ensure balances are always consistent mid-bet:

| Phase | Trigger | bust_balance | sweep_balance | push_balance |
|---|---|---|---|---|
| **Phase 1** (active → pending) | `transition_bet_to_pending` | `−= wager` | `+= (payout_share − wager)` | unchanged |
| **Phase 2 — win** (pending → resolved) | `apply_bet_payouts` | `+= payout_share` | small rounding correction | `+= profit` |
| **Phase 2 — lose** (pending → resolved) | `apply_bet_payouts` | unchanged | `−= payout_share` | `−= wager` |
| **Wash** (pending → washed) | `refund_bet_points_on_wash` | `+= wager` | `−= (payout_share − wager)` | unchanged |

At any point: `bust_balance` = spendable holdings; `sweep_balance` = contingent escrow; `push_balance` = cumulative net profit/loss.

### 4.4 Trigger Chain

The trigger chain on `bet_proposals` is critical and order-sensitive:

```
bet_proposals INSERT:
  BEFORE: set_bet_close_time()          ← computes close_time (SECURITY DEFINER)
  AFTER:  messages_sync_from_bet_proposals()
          touch_table_last_activity()

bet_proposals UPDATE:
  BEFORE: set_bet_close_time()          ← recomputes close_time if time_limit changed
          set_bet_resolved_on_winning_choice()   ← auto-resolve on winning_choice set
          resolution_enforce_no_winner_wash()    ← force-wash if no winners
  AFTER:  apply_bet_payouts()                    [resolved — Phase 2 payouts]
          refund_bet_points_on_wash()             [pending → washed — Phase 1 reversal]
          create_system_message_on_bet_status_change() [any status change]
          create_system_message_on_bet_washed()        [washed — single source of truth]
          log_bet_status_transition()
          messages_sync_from_bet_proposals()
          touch_table_last_activity()
```

> **Wash message source of truth:** `create_system_message_on_bet_washed()` (DB trigger) is the single writer of "Bet #xxx washed" system messages. `washService.ts` does **not** insert system messages — doing so would produce duplicates.

### 4.5 Message Sync Pattern

The `messages` table acts as a **unified feed** combining three source types. Trigger-based sync keeps it in lockstep:

- `text_messages` INSERT/UPDATE → `messages_sync_from_text_messages()` → inserts/upserts into `messages` with `message_type = 'chat'`
- `system_messages` INSERT/UPDATE → `messages_sync_from_system_messages()` → `message_type = 'system'`
- `bet_proposals` INSERT/UPDATE → `messages_sync_from_bet_proposals()` → `message_type = 'bet_proposal'`

This allows the client to subscribe to a single `messages` channel per table to receive all feed activity.

### 4.6 Row Level Security (RLS)

All tables have RLS enabled. Key policies:

| Table | Read | Write | Delete |
|---|---|---|---|
| `tables` | Host or member | Host only (insert if `host_user_id = auth.uid()`) | Host only |
| `table_members` | Own membership or co-member | Host only (add) | Host or self (leave) |
| `table_members` (UPDATE) | — | Host only via `allow_table_settlement_updates`; `table_id` + `user_id` are immutable (trigger-enforced) | — |
| `bet_proposals` | Table members | Proposer who is a member; must be active, no winning_choice | None (no delete) |
| `bet_participations` | Own rows always; others' after bet closes | Own participation in active open bets | None |
| `messages` | Table members or service_role | Table members or service_role | — |
| `text_messages` | Table members | Own messages as member | **Denied** (explicit deny policy — editing/deletion not an app feature) |
| `friends` | Own friendships | Own (user_id1 = self, no self-friendship) | Own |
| `friend_requests` | Sender or receiver | Sender only (no self-request) | Sender may delete own **pending** requests only |
| `users` | Any authenticated user (own row: all cols via table; other users: `user_id`+`username` via `user_profiles` view) | Own profile only | **Denied** (explicit deny — provisioning via trigger only) |
| `users` (INSERT) | — | — | **Denied** (explicit deny — provisioning via `handle_new_user()` trigger) |
| `resolution_history` | Bet proposer or table members | **Denied** (explicit deny) | **Denied** (explicit deny) |
| `system_messages` | Table members (scoped via `is_user_member_of_table`) | Service role only | None (false) |

**`user_profiles` view** (`public.user_profiles`): A `SECURITY DEFINER` view exposing only `(user_id, username)` from `public.users`. Used by `getUsernamesByIds()` and `listFriends()` on the client for cross-user lookups where `email`, `updated_at`, etc. must not be visible. `getAuthUserProfile()` still queries `public.users` directly (own row, all columns).

---

### 4.7 Realtime Subscriptions (Client)

All Supabase Realtime channels are managed in two files:

| File | Channels | Purpose |
|---|---|---|
| `client/src/data/subscriptions/tableSubscriptions.ts` | `table_members`, `messages`, `bet_proposals`, `user_table_memberships`, `bet_participants` | Table-scoped UI subscriptions (member list, chat feed, bet state) |
| `client/src/features/bets/hooks/useTickets.ts` | `ticket_proposals` (per-table), `my_participations` | Ticket-page bet-state patches and participation changes |
| `client/src/features/social/hooks.ts` | `friend_requests` | Incoming friend-request badge updates |

**Channel naming convention:** `<purpose>:<scopeId>:<SESSION_ID>`

`SESSION_ID` is a `crypto.randomUUID()` generated once per page load (`client/src/shared/utils/sessionId.ts`). It is appended to every channel name to prevent cross-tab channel collisions — without it, two tabs subscribed to the same logical channel would share a single Realtime connection and interfere with each other's lifecycle (§7.2).

**Reconnection:** `handleSubscriptionStatus` in `tableSubscriptions.ts` uses an exponential-backoff retry loop (100 ms × 2ⁿ, capped at 30 s) when a channel hits `CHANNEL_ERROR` or `TIMED_OUT`. The factory function is passed so the backoff can create a fresh channel object on each attempt (§7.3).

**`useTickets` subscription filtering (§7.1):** Instead of one unfiltered global `bet_proposals` subscription (which would receive every platform event), `useTickets` opens one channel **per distinct `table_id`** found in the user's loaded tickets, each filtered server-side with `table_id=eq.<id>`. An in-memory `trackedBetIdsRef` provides a second guard to discard any change not belonging to a tracked bet.

**`touch_table_last_activity` debounce (§7.4):** The trigger skips the `UPDATE` if `last_activity_at > now() - 5 seconds`, capping write amplification during rapid chat to ≤ 1 `tables` UPDATE per 5-second window.

---

## 5. Server Architecture

### 5.1 Entry Point & Bootstrap

`server/src/index.ts` orchestrates the full startup sequence:

```
1. Express app creation
2. Middleware registration (CORS, JSON with 100kb body limit, requestId, httpMetrics)
3. Metrics endpoint (GET /metrics — Prometheus text format, unauthenticated)
4. Route mounting (/api/v1/* — canonical; /api/* — backward-compatible alias)
5. Error handler (tail middleware)
6. Server listen on PORT (default 5001)
7. Post-listen startup:
   a. startResolutionQueue()     — BullMQ worker (async, with startup health probe)
   b. startModeRuntime()         — all mode validators
   c. startBetLifecycleService() — Active→Pending timers (async, with startup health probe)
   d. startNflDataIngestService()— ESPN NFL polling (circuit breaker + adaptive backoff)
   e. startNbaDataIngestService()— NBA.com polling (circuit breaker + adaptive backoff)
8. Graceful shutdown (SIGTERM/SIGINT):
   a. server.close()              — stop accepting HTTP connections, drain in-flight requests
   b. stopModeRuntime()           — halt mode validators
   c. stopBetLifecycleService()   — close lifecycle BullMQ queue + worker
   d. stopResolutionQueue()       — close resolution BullMQ queue + worker
   e. stopNflDataIngestService()  — cancel NFL polling timer
   f. stopNbaDataIngestService()  — cancel NBA polling timer
   g. closeRedisClient()          — quit shared Redis connection
```

### 5.2 Middleware Stack

| Middleware | File | Purpose |
|---|---|---|
| `requestId` | `middleware/requestId.ts` | Attaches UUID to each request for log correlation; wraps downstream handlers in `AsyncLocalStorage` so all logger calls auto-include `requestId` |
| `httpMetrics` | `middleware/httpMetrics.ts` | Records per-request Prometheus metrics: `http_requests_total` (counter) and `http_request_duration_ms` (histogram). Normalizes paths (UUIDs → `:id`) to prevent high-cardinality labels. |
| `requireAuth` | `middleware/auth.ts` | Extracts Bearer token, calls `supabase.auth.getUser()`, attaches `req.authUser` and a user-scoped `req.supabase` client |
| `validateParams` | `middleware/validateRequest.ts` | Validates `req.params` against a Zod schema (UUID format enforcement on path parameters). Returns 400 with structured errors on failure. |
| `validateBody` | `middleware/validateRequest.ts` | Validates `req.body` against a Zod schema. Replaces `req.body` with parsed/coerced data on success, returns 400 on failure. All write-endpoint schemas live in `controllers/schemas.ts`. |
| `idempotency` | `middleware/idempotency.ts` | Ensures repeated POSTs with the same `Idempotency-Key` header return the cached first-execution response. Redis-backed (SET NX, 24 h TTL). Returns 409 for concurrent in-flight duplicates. Currently wired to `POST /tables/:tableId/bets`. |
| `rateLimitHeaders` | `middleware/rateLimitHeaders.ts` | Adds rate-limit response headers |
| `errorHandler` | `middleware/errorHandler.ts` | Catches `AppError` instances, returns structured JSON errors |
| `asyncHandler` | `middleware/errorHandler.ts` | Wraps async route handlers to forward thrown errors |

### 5.3 API Routes

All routes are under `/api/v1` (canonical) and `/api` (backward-compatible alias), protected by `requireAuth`:

| Method | Path | Controller | Purpose |
|---|---|---|---|
| POST | `/bet-proposals` | `betController.createBet` | Create a new bet proposal |
| GET | `/bet-proposals/:betId/participations` | `betController.getParticipations` | Get participations for a bet |
| PUT | `/bet-proposals/:betId/participations` | `betController.upsertParticipation` | Submit/update a user's guess |
| GET | `/tables` | `tableController.getUserTables` | List tables for the authenticated user |
| POST | `/tables` | `tableController.createTable` | Create a new table |
| POST | `/tables/:tableId/settle` | `tableController.settle` | Settle a table (host only — zeros balances, records audit event) |
| DELETE | `/tables/:tableId` | `tableController.deleteTable` | Delete a table (host only) |
| GET | `/tables/:tableId/members` | `tableController.getTableMembers` | List members of a table |
| POST | `/tables/:tableId/members` | `tableController.addTableMember` | Add a member (host only; validates user exists, prevents duplicates) |
| DELETE | `/tables/:tableId/members/:userId` | `tableController.removeTableMember` | Remove a member (host removes anyone; member removes self; host cannot self-remove) |
| GET | `/tables/:tableId/sessions` | `tableController.getTableSessions` | Get bet sessions for a table |
| GET | `/tables/:tableId/bet-proposals` | `betController.getTableBets` | Get all bets for a table |
| GET | `/modes` | `modeController.getModes` | List all registered modes |
| GET | `/modes/preview` | `modeController.getModePreview` | Get live preview data for a specific mode |
| GET | `/tables/:tableId/messages` | `messageController.getMessages` | Paginated message history |
| POST | `/tables/:tableId/messages` | `messageController.sendMessage` | Send a chat message |
| GET | `/tickets` | `ticketController.getUserTickets` | Get user's bet history (tickets) |
| GET | `/friends` | `friendController.getFriends` | List friends |
| POST | `/friends/requests` | `friendController.sendFriendRequest` | Send a friend request |
| DELETE | `/friends/:friendUserId` | `friendController.removeFriend` | Remove a friendship (validates existence, deletes both FK rows via admin client) |
| PUT | `/friends/requests/:requestId` | `friendController.respondToFriendRequest` | Accept/reject |
| PATCH | `/users/me/username` | `userController.updateUsername` | Update authenticated user's username (case-insensitive uniqueness check, 3–15 chars) |

### 5.4 Controller → Service → Repository

```
Controller (req parsing, validation, HTTP status)
    │
    ▼
Service (business logic, orchestration)
    │
    ▼
Repository (data access — extends BaseRepository)
    │
    ▼
Supabase Client (PostgreSQL via PostgREST / RPC)
```

**BaseRepository** (`repositories/BaseRepository.ts`):
- Abstract class accepting a Supabase admin client + logger
- Provides typed cursor-based pagination helpers
- Wraps Supabase errors into `AppError` instances

**Concrete Repositories (server):**
- `betRepository` (in `leagues/sharedUtils/`) — bet CRUD, participation queries
- `TableRepository`, `TicketRepository`, `MessageRepository`, `FriendRepository`, `UserRepository`

### 5.5 Error Handling

`AppError` is the unified error class with static factories:

```typescript
AppError.badRequest(message)       // 400
AppError.notFound(message)         // 404
AppError.conflict(message)         // 409
AppError.tooManyRequests(message)  // 429
AppError.internal(message)         // 500
```

The global `errorHandler` middleware catches these and returns:
```json
{
  "error": { "message": "...", "code": "BAD_REQUEST", "requestId": "..." }
}
```

Non-AppError exceptions are logged and returned as 500 Internal Server Error.

**Validation errors** from `validateBody`/`validateParams` are returned before the handler executes:
```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [{ "field": "proposer_user_id", "message": "Must be a valid UUID" }]
}
```

### 5.6 Environment Configuration

`server/src/config/env.ts` uses Zod to validate all environment variables at startup:

| Variable | Required | Default | Description |
|---|---|---|---|
| `SUPABASE_URL` | ✅ | — | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | — | Service-role key (full DB access) |
| `PORT` | ❌ | `5001` | Express listen port |
| `REDIS_URL` | ✅ | — | Redis connection string |
| `NFL_POLL_INTERVAL_MS` | ❌ | `20000` | ESPN NFL polling interval |
| `NBA_POLL_INTERVAL_MS` | ❌ | `20000` | ESPN NBA polling interval |
| `RESOLUTION_QUEUE_CONCURRENCY` | ❌ | `5` | BullMQ worker concurrency |
| `BET_LIFECYCLE_CATCHUP_INTERVAL_MS` | ❌ | `60000` | Catchup sweep interval |

Startup fails fast if required variables are missing.

---

## 6. Client Architecture

### 6.1 Application Shell

```
main.tsx
  └─ <React.StrictMode>
       └─ <BrowserRouter>
            └─ <QueryProvider>         (TanStack Query — staleTime 30s, gcTime 5min)
                 └─ <AuthProvider>     (Supabase Auth session management)
                      └─ <App />
```

**App.tsx** uses `React.lazy()` for route-level code splitting:

| Route | Page | Description |
|---|---|---|
| `/` | `HomePage` | Landing / dashboard |
| `/tables` | `TablesListPage` | List of user's tables |
| `/tables/:tableId` | `TableView` | Single table — chat, bets, members |
| `/tickets` | `TicketsPage` | Bet history |
| `/account` | `AccountPage` | User profile |
| `*` | `NotFoundPage` | 404 |

All routes are wrapped in `<ErrorBoundary>` + `<Suspense>`.

### 6.2 Feature Modules

The client follows a **feature-based** folder structure:

```
features/
  auth/         → AuthProvider, useAuth hook, auth types
  bets/         → Bet hooks, service, mappers, types, utils
  table/        → Table hooks, services, chat, types
  social/       → Friend/social hooks and types
```

Each feature exports its public API through an `index.ts` barrel file.

### 6.3 Data Layer

```
data/
  clients/
    restClient.ts       → HTTP client with Bearer token injection, HttpError class
    supabaseClient.ts   → Supabase client (anon key, typed with Database)
  repositories/
    betsRepository.ts   → REST calls for bet CRUD
    modesRepository.ts  → REST calls for mode listing/preview
    tablesRepository.ts → REST calls for table CRUD
    socialRepository.ts → REST calls for friends
    usersRepository.ts  → REST calls for user profile
  subscriptions/
    tableSubscriptions.ts → Supabase Realtime channel management
  types/
    supabase.ts         → Generated Supabase types (from CLI)
```

**restClient** attaches the Supabase session token as a Bearer header on every request. On 401 responses, the user is redirected to re-authenticate.

### 6.4 TanStack Query Integration

All server-state fetching uses TanStack Query hooks. Query keys are centralized in `shared/queryKeys.ts`:

```typescript
queryKeys = {
  tables:  { all, detail(id), members(id), sessions(id) },
  tickets: { all },
  modes:   { all, preview(params) },
  bets:    { byTable(tableId), participations(betId) },
  social:  { friends, friendRequests },
}
```

Key hooks (in `features/bets/hooks/`, `features/table/hooks/`):
- `useUserTables()` — table list with TanStack Query
- `useTableMembers(tableId)` — members list
- `useTableSessions(tableId)` — session data
- `useTableBets(tableId)` — bet proposals for a table
- `useBetParticipations(betId)` — participation data
- `useModes()` — all registered modes
- `useModePreview(params)` — live mode preview data
- `useUserTickets()` — ticket history
- `useFriends()` — friend list

### 6.5 Shared Utilities

```
shared/
  hooks/
    useBetPhase.ts     → Derive bet phase (active/pending/resolved/washed)
    useDialog.ts       → Dialog open/close state management
    useDomTimer.ts     → Countdown timer with DOM ref updates
    useIsMobile.ts     → Responsive breakpoint detection
  utils/
    dateTime.ts        → Date formatting utilities
    error.ts           → Error normalization / display helpers
    logger.ts          → createLogger() factory for client-side logging
    number.ts          → Number formatting (currency, percentages)
  widgets/
    ErrorBoundary/     → React error boundary component
    FilterBar/         → Reusable filter UI
  providers/
    QueryProvider.tsx  → TanStack QueryClientProvider wrapper
```

---

## 7. Bet Lifecycle

The bet lifecycle is a state machine managed across three systems: the database (triggers), the server (services), and the resolution queue (BullMQ).

### 7.1 State Machine

```
                    ┌───────────┐
        create bet  │  ACTIVE   │  Users submit guesses
        ──────────► │           │  (close_time = proposal_time + time_limit_seconds)
                    └─────┬─────┘
                          │
                 close_time reached
                 (BetLifecycleService timer)
                          │
                          ▼
              ┌───────────────────────┐
              │ transition_bet_to_    │  (Supabase RPC)
              │ pending()             │
              │                       │
              │ • ≥2 distinct guesses?│
              │   YES → PENDING       │
              │   NO  → WASHED        │
              │                       │
              │ • Adjust              │
              │   balances            │
              └───┬──────────┬────────┘
                  │          │
               PENDING     WASHED
                  │          │
                  │          └──► refund_bet_points_on_wash() trigger
                  │               → Reverses balance escrow
                  │               → resolution_history logged
                  ▼
         Mode Validator resolves
         (set_winning_choice via
          Resolution Queue)
                  │
                  ├──► captureLiveInfoSnapshot()
                  │    → resolve_or_wash_live_info logged
                  │      (frozen info-modal data)
                  │
                  ▼
           ┌──────────┐
           │ RESOLVED │  set_bet_resolved_on_winning_choice() trigger
           └─────┬────┘
                 │
                 ▼
        apply_bet_payouts() trigger
        → Winners: bust↑ push↑
        → Losers:  push↓ sweep↓
        → resolution_history logged

        ──── OR if no winner matched ────

        resolution_enforce_no_winner_wash() trigger
        → Force status to WASHED
        → refund_bet_points_on_wash() fires
```

### 7.2 BetLifecycleService

`server/src/services/bet/betLifecycleService.ts` → delegates to `betLifecycleQueue.ts`

Uses a dedicated **BullMQ delayed-job queue** (`bet-lifecycle`) instead of in-process `setTimeout`/`setInterval`.  This ensures:
- **Replica-safe:** Only one worker fires each transition, even with multiple server instances.
- **Crash-resilient:** Jobs survive process restarts (persisted in Redis).
- **Deduplication:** Each bet gets a single job (keyed by `lifecycle-{betId}`).

- **On startup:** Queries all active bets and enqueues a delayed job for each based on `close_time - now()`.
- **On job fire:** Calls `transition_bet_to_pending(bet_id)` RPC with automatic retry (3 attempts, exponential backoff).
- **Catchup cycle:** A repeatable BullMQ job fires every `BET_LIFECYCLE_CATCHUP_MS` (default 60s) to catch any missed transitions.
- **New bet registration:** `registerBetLifecycle(betId, closeTime)` enqueues a delayed job immediately.

### 7.3 Balance Mechanics

Three balances track a member's financial state per table:

| Balance | Description |
|---|---|
| **bust_balance** | "Cash on hand." Starts at 0 (or initial allocation). Decremented when bet goes pending (escrow), restored on wash, increased on win. |
| **push_balance** | Net profit/loss. Incremented for winners (payout − wager), decremented for losers (−wager). |
| **sweep_balance** | Contingent value during pending phase. Represents potential payout if the user's guess wins. Cleared on resolution or wash. |

The `transition_bet_to_pending` RPC adjusts balances atomically:
- `bust_balance -= wager` (escrowed)
- `sweep_balance += potential_payout` (contingent gain)

On resolution (`apply_bet_payouts` trigger):
- Winners: `bust_balance += payout`, `push_balance += net_profit`, `sweep_balance -= potential_payout`
- Losers: `push_balance -= wager`, `sweep_balance -= potential_payout`

On wash (`refund_bet_points_on_wash` trigger):
- All participants: `bust_balance += wager` (refund), `sweep_balance -= potential_payout + wager` (reverse)

---

## 8. Mode System

### 8.1 Mode Registry

`server/src/leagues/registry.ts` maintains a central `Map<string, ModeRegistryEntry>`:

```typescript
interface ModeRegistryEntry {
  key: string;
  displayName: string;
  description: string;
  leagues: Set<League>;
  module: LeagueModeModule;
}
```

**Registration** happens at module load time. Each mode module calls `registerMode()` to add itself:

```typescript
registerMode({
  key: 'propHunt',
  displayName: 'Prop Hunt',
  description: '...',
  leagues: new Set(['NFL', 'NBA']),
  module: { createValidator, getPreview, getBetOptions },
});
```

**Lookup APIs:**
- `getMode(key)` → `ModeRegistryEntry | undefined`
- `getModeOrThrow(key)` → throws `AppError.notFound` if missing
- `listModesForLeague(league)` → all modes supporting that league
- `getActiveLeagues()` → set of leagues with ≥1 registered mode

### 8.2 Mode Module Structure

Each mode is a folder under its league:

```
leagues/
  nfl/
    eitherOr/  
    chooseTheirFate/
    kingOfTheHill/
    propHunt/
    scoreSorcerer/
    spreadTheWealth/
    totalDisaster/
  nba/
    eitherOr/
    kingOfTheHill/
    propHunt/
    scoreSorcerer/
    spreadTheWealth/
    totalDisaster/
  u2pick/
    tableTalk/
```

Each mode module exports a `LeagueModeModule` interface:

| Export | Purpose |
|---|---|
| `createValidator(config)` | Factory that returns a validator instance (extends `BaseValidatorService`) |
| `getPreview(params)` | Returns live preview data for the mode selection UI |
| `getBetOptions(params)` | Returns the available choices/options for bet creation |

### 8.3 BaseValidatorService

`server/src/leagues/sharedUtils/baseValidatorService.ts`

Abstract base class that all mode validators extend. Provides:

| Capability | Implementation |
|---|---|
| **Game feed subscription** | Via `ModeRuntimeKernel` — subscribes to the league's game feed |
| **Pending bet monitoring** | Supabase Realtime subscription on `bet_proposals` filtered by mode |
| **Redis JSON store** | `RedisJsonStore` for baselines, progress snapshots, intermediate state |
| **Wash handling** | `WashService` integration — detects unresolvable bets |
| **Resolution queue** | Enqueues `set_winning_choice`, `wash_bet`, or `record_history` jobs |
| **Lifecycle** | `start()` / `stop()` methods for graceful startup/shutdown |

**Configuration:**
```typescript
{
  league: 'NFL' | 'NBA' | ...,
  modeKey: 'propHunt' | 'eitherOr' | ...,
  channelName: string,    // Supabase realtime channel
  storeKeyPrefix: string, // Redis key namespace
}
```

### 8.4 Shared Mode Factories

The `sharedUtils/` directory contains reusable factories for common mode patterns:

| Factory | Used By | Pattern |
|---|---|---|
| `eitherOrFactory` | NFL eitherOr, NBA eitherOr | Binary-choice bets |
| `kingOfTheHillFactory` | NFL KotH, NBA KotH | Stat-leader bets |
| `propHuntFactory` | NFL propHunt, NBA propHunt | Player-prop over/under |
| `scoreSorcererFactory` | NFL scoreSorcerer, NBA scoreSorcerer | Score prediction |
| `spreadTheWealthFactory` | NFL spreadTheWealth, NBA spreadTheWealth | Point-spread bets |
| `totalDisasterFactory` | NFL totalDisaster, NBA totalDisaster | Total (over/under) bets |
| `spreadEvaluator` | (shared) | Evaluates spread-based outcomes |
| `resolveUtils` | (shared) | Common resolution logic |

### 8.5 ModeRuntimeKernel

`server/src/leagues/sharedUtils/modeRuntimeKernel.ts`

Each validator gets its own kernel instance that provides:

1. **Game feed subscription** — Listens to the league's game feed (NFL or NBA ESPN data). Deduplicates events by computing a hash signature.
2. **Pending bet monitoring** — Subscribes to Supabase Realtime for `bet_proposals` changes filtered to the mode's `mode_key` and `bet_status = 'pending'`.
3. **Lifecycle management** — `start()` initializes subscriptions, `stop()` tears them down.

The kernel emits events that the validator's concrete implementation handles (e.g., "game stats updated" → check if any pending bet can be resolved).

---

## 9. League Data Pipeline

### 9.1 Provider Architecture

```
services/leagueData/
  index.ts          → Unified accessor (getGameStatus, getPlayerStat, etc.)
  registry.ts       → Provider registration (NFL, NBA, U2Pick)
  feeds/
    index.ts        → Game feed module — auto-registers NFL/NBA feeds
  kernel/
    LeagueKernel.ts → Per-league kernel for data orchestration
    orchestrator.ts → Starts/stops all league kernels
```

**Provider Registry** maps each league to its data accessor:

```typescript
registerProvider('NFL', nflProvider);
registerProvider('NBA', nbaProvider);
registerProvider('U2Pick', u2pickProvider);
```

The unified accessor routes calls:
```typescript
getGameStatus(league, gameId)  → provider[league].getGameStatus(gameId)
getPlayerStat(league, ...)     → provider[league].getPlayerStat(...)
```

### 9.2 Data Ingest Services

```
services/
  nflData/           → NFL ESPN polling service
  nbaData/           → NBA ESPN polling service
  dataIngest/        → Shared ingest utilities
```

Both NFL and NBA data ingest services:
1. Poll ESPN APIs at configurable intervals (default 20s).
2. Parse raw ESPN responses into normalized internal formats.
3. Store current game state in Redis for fast access.
4. Emit game feed events that `ModeRuntimeKernel` instances consume.

**Resilience features:**
- **Circuit breaker** (`utils/circuitBreaker.ts`) wraps all upstream API calls (ESPN / NBA.com). After 5 consecutive failures the circuit opens and short-circuits calls for 60 s, then allows a single probe (HALF_OPEN). Success closes the circuit; failure reopens it.
- **Adaptive backoff** on the polling timer: delay is `baseInterval × min(2^consecutiveFailures, 16)`. Resets to base on the first successful tick.

**Data flow:**
```
ESPN API (HTTP poll)
    │
    ▼
Data Ingest Service (nflData/ or nbaData/)
    │
    ├──► Redis (cached game state — scoreboard, player stats)
    │
    └──► Game Feed Events
              │
              ▼
         ModeRuntimeKernel (per-mode)
              │
              ▼
         Validator (checks pending bets against new data)
              │
              ▼
         Resolution Queue (if bet can be resolved)
```

### 9.3 Refined Data Accessors

```
server/src/data/
  nflRefinedDataAccessors.ts  → NFL-specific stat extraction
  nbaRefinedDataAccessors.ts  → NBA-specific stat extraction
  nfl_data/                   → NFL data files/schemas
  nba_data/                   → NBA data files/schemas
  test_nfl_data/              → NFL test fixtures
  test_nba_data/              → NBA test fixtures
```

These accessors provide structured access to raw ESPN data — player stats, game scores, play-by-play, etc.

---

## 10. Realtime & Subscriptions

### 10.1 Server-Side Realtime

The server uses Supabase Realtime for **pending bet monitoring** within `ModeRuntimeKernel`:

```typescript
supabase.channel('mode-{modeKey}')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'bet_proposals',
    filter: `mode_key=eq.{modeKey}`,
  }, handler)
  .subscribe();
```

This allows validators to react immediately when a bet transitions to `pending` (rather than polling).

### 10.2 Client-Side Realtime

`client/src/data/subscriptions/tableSubscriptions.ts`

When a user enters a table view, the client subscribes to three Supabase Realtime channels:

| Channel | Table | Events | Purpose |
|---|---|---|---|
| `table-members:{tableId}` | `table_members` | INSERT, UPDATE, DELETE | Member list & balance updates |
| `table-messages:{tableId}` | `messages` | INSERT | New messages in unified feed |
| `table-bets:{tableId}` | `bet_proposals` | INSERT, UPDATE | New bets & status changes |

On receiving events, the corresponding TanStack Query caches are invalidated to trigger UI re-renders.

---

## 11. Authentication & Authorization

### 11.1 Auth Flow

```
Client                          Supabase Auth                     Server
  │                                  │                               │
  │  1. Google OAuth redirect ──────►│                               │
  │  2. ◄── JWT (access + refresh)   │                               │
  │                                  │                               │
  │  3. API call (Authorization:     │                               │
  │     Bearer <access_token>) ─────────────────────────────────────►│
  │                                  │  4. supabase.auth.getUser()   │
  │                                  │◄──────────────────────────────│
  │                                  │  5. ──── user object ────────►│
  │                                  │                               │
  │  6. ◄─────────────────────── Response ───────────────────────────│
```

### 11.2 Server Auth Middleware

`server/src/middleware/auth.ts`:

1. Extracts Bearer token from `Authorization` header.
2. Creates a user-scoped Supabase client (with the user's token).
3. Calls `supabase.auth.getUser()` to validate and decode.
4. Attaches to request:
   - `req.authUser` — the authenticated user object (contains `id`, `email`, etc.)
   - `req.supabase` — a Supabase client scoped to the user's permissions (respects RLS)
5. If invalid/expired, returns 401 Unauthorized.

### 11.3 Supabase Clients

| Client | Location | Key Type | Purpose |
|---|---|---|---|
| Admin client | `server/src/supabaseClient.ts` | `service_role_key` | Full DB access, bypasses RLS. Used for background services (lifecycle, validators, ingest). |
| Per-request client | Created in `requireAuth` middleware | User's JWT | RLS-scoped queries for user-facing API routes. |
| Browser client | `client/src/data/clients/supabaseClient.ts` | `anon` key | Auth flows, Realtime subscriptions. All data reads go through the REST API (server), not direct Supabase queries. |

### 11.4 User Provisioning

When a new user signs up via Google OAuth, Supabase Auth creates a row in `auth.users`. The `handle_new_user()` trigger automatically creates a corresponding row in `public.users` with the same `user_id` and `email`.

---

## 12. Infrastructure Services

### 12.1 Resolution Queue (BullMQ)

`server/src/leagues/sharedUtils/resolutionQueue.ts`

A BullMQ queue named `bet-resolution` processes bet outcomes:

| Job Type | Purpose |
|---|---|
| `set_winning_choice` | Sets `winning_choice` on a bet_proposal → triggers resolve cascade |
| `wash_bet` | Sets `bet_status = 'washed'` → triggers refund cascade |
| `record_history` | Inserts a record into `resolution_history` |

**Configuration:**
- Concurrency: configurable via `RESOLUTION_QUEUE_CONCURRENCY` (default 5)
- Retries: exponential backoff (3 attempts, 1 s base)
- Connection: shared Redis instance
- **Startup health probe:** `queue.getWaitingCount()` is called immediately after creation to verify Redis connectivity. Throws on failure, preventing the server from starting in a broken state.
- **DLQ alerting:** When a job exhausts all retry attempts, the `worker.on('failed')` handler writes a `resolution_failed` event to `resolution_history` for the affected bet, making failures visible in dashboards.

### 12.1.1 Live Info Snapshot on Resolve / Wash

`server/src/leagues/sharedUtils/liveInfoSnapshot.ts`

When a bet is resolved or washed, `captureLiveInfoSnapshot()` is called (fire-and-forget) to freeze the current live-info data as a `resolve_or_wash_live_info` event in `resolution_history`. This allows the client's Information Modal to display meaningful data for historical bets even after Redis baselines expire and game feeds go offline.

- **Trigger points:** `BaseValidatorService.resolveWithWinner()`, `BaseValidatorService.washBet()`, `betController.validateBet()`, `washBetWithHistory()`.
- **Reuses existing `getModeLiveInfo()`** — each mode's live-info logic produces the snapshot; no per-mode code is needed.
- **Payload shape:** `{ modeKey, modeLabel, fields[], capturedAt, trigger, outcomeDetail }` — identical to `ModeLiveInfo` with metadata.
- **Client impact:** `GET /api/bets/:betId/live-info` checks bet status first; for settled bets it returns the snapshot from history instead of querying live data.

### 12.2 Rate Limiting

`server/src/infrastructure/rateLimiters.ts`

Redis-backed sliding-window rate limiters (singleton instances).  The `check()` method uses a **single Lua script** executed atomically inside Redis (ZREMRANGEBYSCORE + ZCARD + ZADD in one round-trip), preventing the race condition where concurrent requests could all read "under limit" before any of them records an entry.

| Limiter | Window | Max Requests | Applied To |
|---|---|---|---|
| Message | 1 minute | 20 | Chat message sends |
| Friend | 1 minute | 10 | Friend request operations |
| Bet | 1 minute | (configurable) | Bet proposal creation |

When a limit is exceeded, an `AppError.tooManyRequests()` is thrown (429 status).

### 12.3 Redis Usage Summary

**Connection resilience:** The shared Redis client (`utils/redisClient.ts`) uses an explicit `retryStrategy` with exponential backoff (500 ms base, 30 s cap) for up to 20 reconnect attempts. After exhausting retries the client gives up and logs a fatal error.

| Use Case | Key Pattern | Description |
|---|---|---|
| Game state cache | `nfl:game:{gameId}`, `nba:game:{gameId}` | Cached ESPN data for fast validator access |
| Validator store | `{storeKeyPrefix}:{betId}` | JSON blobs for baselines, progress, intermediate state |
| Config sessions | `config-session:{sessionId}` | Mode configuration wizard sessions (TTL = SESSION_TTL_MS) |
| Rate limiters | `ratelimit:{type}:{key}` | Atomic sliding-window counters (Lua script) |
| BullMQ – resolution | `bull:bet-resolution:*` | Bet resolution job queue |
| BullMQ – lifecycle | `bull:bet-lifecycle:*` | Bet lifecycle delayed-job queue (active→pending transitions) |

### 12.4 Logging & Observability

**Server:** Structured JSON logging via **pino** (`utils/logger.ts`). A root pino instance is configured with a `mixin()` function that reads the current `requestId` from an `AsyncLocalStorage` context (`utils/requestContext.ts`), so every log line in a request scope automatically includes the originating `requestId`. Child loggers are created per service via `createLogger(prefix)`:

```typescript
const logger = createLogger('betService');
logger.info({ betId, from: 'active', to: 'pending' }, 'Bet transitioned');
logger.error({ betId, err }, 'Resolution failed');
```

Log level: `debug` in development, `info` in production. Output is newline-delimited JSON (ndjson), ready for aggregation in Datadog, Loki, or CloudWatch.

**Request context propagation:** The `requestIdMiddleware` wraps each request in `requestContext.run({ requestId })` using Node.js `AsyncLocalStorage`. All downstream code — controllers, services, repositories, BullMQ workers — automatically inherits the `requestId` in pino log output without any explicit parameter passing.

**Metrics:** A lightweight Prometheus-compatible metrics system (`infrastructure/metrics.ts`) exposes three metric types:

| Type | Metric | Labels | Purpose |
|---|---|---|---|
| Counter | `http_requests_total` | `method`, `path`, `status` | Total HTTP requests |
| Histogram | `http_request_duration_ms` | `method`, `path`, `status` | Request latency (ms) |
| Histogram | `external_api_duration_ms` | `provider`, `status` | ESPN/NBA upstream latency |
| Gauge | `resolution_queue_depth` | — | Resolution queue waiting jobs |
| Gauge | `lifecycle_queue_depth` | — | Lifecycle queue waiting jobs |
| Gauge | `circuit_breaker_state` | `name` | Circuit breaker state (0=closed, 1=open, 2=half-open) |

Metrics are served at `GET /metrics` in Prometheus text exposition format (`text/plain; version=0.0.4`), ready for scraping by Prometheus or Grafana Agent.

**Health checks:** `GET /api/health` includes Redis, Supabase, and BullMQ worker status:
```json
{
  "status": "healthy | degraded | unhealthy",
  "checks": {
    "redis": { "ok": true, "latencyMs": 2 },
    "supabase": { "ok": true, "latencyMs": 15 },
    "bullmq": { "resolutionWorker": true, "lifecycleWorker": true }
  }
}
```

**Client:** `createLogger(tag)` factory that produces scoped loggers:
```typescript
const log = createLogger('useTableBets');
log.debug('Fetching bets for table', tableId);
```

Production builds suppress debug-level output.

---

## 13. Data Flow Walkthrough

### 13.1 Creating a Bet (End-to-End)

```
1. User fills out bet form on TableView page
   └─ Selects mode, game, options, wager, time limit

2. Client calls betsRepository.createBet(payload)
   └─ POST /api/bet-proposals (with Bearer token)

3. Server: betController.createBet
   └─ Validates request body
   └─ Calls betService.createBet()

4. betService inserts into bet_proposals via Supabase
   └─ Triggers fire:
       BEFORE: set_bet_close_time() → computes close_time
       AFTER:  messages_sync_from_bet_proposals() → unified feed entry
               touch_table_last_activity()

5. BetLifecycleService.registerBet(betId, closeTime)
   └─ Enqueues a delayed BullMQ job (fires at closeTime + 250ms grace)

6. Client receives 201 Created
   └─ TanStack Query invalidates bets.byTable(tableId)
   └─ Supabase Realtime delivers INSERT event → UI updates

7. Other users see the bet appear in their table feed
   └─ They submit participations via PUT /api/bet-proposals/:betId/participations
```

### 13.2 Bet Resolution (End-to-End)

```
1. close_time reached → BullMQ lifecycle job fires

2. Calls transition_bet_to_pending(betId) RPC
   └─ Checks ≥2 distinct guesses → moves to PENDING
   └─ Adjusts bust/sweep balances atomically
   └─ System message generated ("Bet #abc pending...")

3. Supabase Realtime emits UPDATE (bet_status = 'pending')
   └─ ModeRuntimeKernel picks up the event
   └─ Validator starts monitoring game data for this bet

4. ESPN data ingest updates game state in Redis

5. Validator checks: can this bet be resolved?
   └─ e.g., propHunt: has the player stat exceeded the line?
   └─ YES → enqueue set_winning_choice job

6. Resolution Queue worker processes the job:
   └─ UPDATE bet_proposals SET winning_choice = '...' WHERE bet_id = ...
   └─ Triggers fire:
       BEFORE: set_bet_resolved_on_winning_choice() → status = 'resolved'
               resolution_enforce_no_winner_wash() → wash if no winner
       AFTER:  apply_bet_payouts() → distribute winnings
               create_system_message_on_bet_status_change()
               log_bet_status_transition()

7. Supabase Realtime delivers UPDATE to all table subscribers
   └─ Client TanStack Query caches invalidated
   └─ UI shows resolved bet with winner/loser indicators

8. Users see updated bust/push/sweep balances
```

---

## 14. Database Migrations

### 14.1 Supabase CLI

Database schema is managed via the [Supabase CLI](https://supabase.com/docs/guides/cli) migration system. The `supabase/` directory lives at the repository root.

```
supabase/
├── config.toml                          # CLI config (project_id: p2picks_football)
├── seed.sql                             # Local dev seeding template
└── migrations/
    ├── 20260225000000_baseline.sql       # Full baseline: 11 tables, 4 enums, 22 functions, 18 triggers, all RLS
    ├── 20260225000001_create_table_settlements.sql  # table_settlements table + RLS + index
    ├── 20260225000002_atomic_rpcs_and_cascades.sql  # settle_table, create_table_with_host, accept_friend_request RPCs + 6 CASCADE FKs
    ├── 20260225000003_rls_hardening.sql             # 7 RLS changes: deny policies, user_profiles view, text_messages lock, table_members immutable trigger
    ├── 20260225000004_trigger_function_cleanup.sql  # Phase 6: drop redundant trigger, consolidate helper fns, SECURITY DEFINER hardening, escrow comments
    ├── 20260225000005_schema_constraint_hardening.sql  # Phase 7: 3 indexes, 3 check constraints, drop bad FK defaults, username CI index, timestamp consistency
    └── 20260225000006_realtime_improvements.sql        # Phase 8: debounce touch_table_last_activity (≤1 UPDATE per 5 s)
```

**Migration 20260225000004 summary (Phase 6):**
- **Dropped** `trg_set_bet_close_time_before_insert` — redundant with `trg_set_bet_close_time` (INSERT OR UPDATE)
- **Consolidated** `is_table_member` → `is_user_member_of_table`: rewrote three `bet_participations` RLS policies to call the canonical `SECURITY DEFINER` function; dropped the orphan `is_table_member`
- **Hardened** four functions with `SECURITY DEFINER` + `SET search_path TO 'public'`: `set_bet_close_time`, `set_bet_resolved_on_winning_choice`, `enforce_immutable_bet_participation_fields`, `is_bet_open`
- **Documented** two-phase escrow model as inline comments in `transition_bet_to_pending` and `apply_bet_payouts`
- **Server** (`washService.ts`): removed `createWashSystemMessage()` — wash messages are now exclusively generated by the `trg_bet_proposals_washed_msg` DB trigger (prevents duplicate messages)

**Migration 20260225000005 summary (Phase 7):**
- **Indexes added:** `idx_bet_proposals_table_id_status`, `idx_friend_requests_sender_status`, `idx_friend_requests_receiver_status`
- **Check constraints added:** `bet_proposals_wager_positive` (`wager_amount > 0`), `friend_requests_no_self_request` (`sender ≠ receiver`), `text_messages_length_limit` (`length ≤ 1000`)
- **Removed bad defaults:** `DEFAULT gen_random_uuid()` dropped from FK columns `friends.user_id1`, `friends.user_id2`, `table_members.table_id`, `table_members.user_id`
- **Case-insensitive username index:** `idx_users_username_lower` — `UNIQUE ON lower(username) WHERE username IS NOT NULL`
- **Timestamp consistency:** `messages_sync_from_bet_proposals` and `touch_table_last_activity` rewritten to use `now()` instead of `timezone('utc', now())`
- **Client** (`socialRepository.ts`): `isUsernameTaken` updated to use `.ilike()` to leverage `idx_users_username_lower`

**Migration 20260225000006 summary (Phase 8):**
- **Debounce `touch_table_last_activity`:** Rewrote the trigger function to skip the `UPDATE tables SET last_activity_at` if `last_activity_at > now() - interval '5 seconds'`. Prevents write amplification (previously fired for every chat message, bet insert, etc.). Write rate capped to ≤ 1 `tables` UPDATE per 5-second window.

### 14.2 Migration Workflow

| Command | Purpose |
|---|---|
| `npx supabase migration list` | Show applied/pending migrations (local vs remote) |
| `npx supabase migration new <name>` | Create a new timestamped migration file |
| `npx supabase db push` | Apply pending migrations to the linked remote project |
| `npx supabase db reset` | Reset local database and re-apply all migrations + seed |

**Rules:**
- All schema changes go through migration files — never edit production via the Dashboard SQL editor.
- Migrations are append-only (never edit an applied migration).
- Baseline migration captures the full schema as of Phase 1; subsequent changes are incremental.

---

## 15. DevOps & Deployment

### 15.1 CI Pipeline (GitHub Actions)

`.github/workflows/ci.yml` runs on every push/PR to `main` that touches `server/**`:

```
1. Checkout + Node.js 20 setup (npm cache from package-lock.json)
2. npm ci
3. ESLint — src/**/*.ts (0 errors enforced; warnings allowed)
4. tsc --noEmit — full type-check
5. vitest run --coverage — all unit + integration tests
6. Coverage gate — statement coverage ≥ 70% (fails the build if below)
7. Upload coverage artifacts (14-day retention)
```

A Redis 7 Alpine service container is spun up for integration tests that need it.

### 15.2 Docker

**Multi-stage Dockerfile** (`server/Dockerfile`):

| Stage | Base Image | Purpose |
|---|---|---|
| `builder` | `node:20-alpine` | Install all deps, compile TypeScript via `tsc -p .` → `dist/` |
| `runner` | `node:20-alpine` | Production deps only, copy compiled JS, non-root user |

**Security:** Runs as `appuser` (non-root). `HEALTHCHECK` pings `GET /metrics`.

**docker-compose.yml** (repo root) provides a local development stack:
- `redis` — Redis 7 Alpine with health check and persistent volume
- `server` — Builds from `server/Dockerfile`, reads `server/.env`, depends on Redis healthy

```bash
# Local dev — just Redis (use with ts-node-dev)
docker compose up -d redis

# Full stack
docker compose up --build
```

### 15.3 Environment Configuration

All environment variables are validated at startup by a Zod schema (`src/config/env.ts`).
Full documentation with types, defaults, and descriptions is in `server/.env.example`.

### 15.4 Load Testing

A [k6](https://grafana.com/docs/k6/) smoke test is available at `server/tests/load/k6-smoke.js`:

```bash
k6 run server/tests/load/k6-smoke.js \
  --env K6_AUTH_TOKEN="eyJ..." \
  --env K6_TABLE_ID="abc-123"
```

**Stages:** Ramp-up (0→20 VUs, 30s) → Sustained (20 VUs, 2m) → Spike (50 VUs, 45s) → Ramp-down.
**Thresholds:** p95 latency < 500ms, p99 < 1000ms, error rate < 5%.

### 15.5 Redis Key Namespaces

Full reference in `server/docs/REDIS_KEYS.md`. Key subsystems:

| Prefix Pattern | Subsystem |
|---|---|
| `bull:bet-resolution:*` | BullMQ resolution queue |
| `bull:bet-lifecycle:*` | BullMQ lifecycle queue |
| `ratelimit:{type}:{userId}` | Sliding-window rate limiters |
| `config-session:{sessionId}` | Mode config wizard sessions |
| `{modePrefix}:{betId}` | Validator baseline/progress stores (13 modes) |

---