# P2Picks — System Architecture

> **Last updated:** 2025-07  
> **Status:** Living document — update when subsystems change.

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
14. [Directory Reference](#14-directory-reference)

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
| Logging | Structured `logger` utility (server); `createLogger` (client) |

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
│  Middleware: requestId → auth → rateLimitHeaders → errorHandler  │
│  Routes:    /api/bet-proposals, /api/tables, /api/modes, ...     │
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
 ├── bust_balance (float8, default 0)
 ├── push_balance (float8, default 0)
 ├── sweep_balance (float8, default 0)

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
 ├── event_type (text: payout | wash_refund | status_transition | washed)
 ├── payload (jsonb)
 ├── created_at
```

### 4.2 Custom Enum Types

| Enum | Values |
|---|---|
| `bet_lifecycle_status` | `active`, `pending`, `resolved`, `washed` |
| `league` | `NFL`, `NBA`, `MLB`, `NHL`, `NCAAF`, `U2Pick` |
| `message_type` | `chat`, `system`, `bet_proposal` |
| `friend_request_status` | `pending`, `accepted`, `rejected` |

### 4.3 Key RPC Functions

| Function | Purpose |
|---|---|
| `transition_bet_to_pending(p_bet_id)` | Atomically moves an active bet to pending. Validates close_time has passed, checks for sufficient participation diversity (≥ 2 distinct guesses), washes if not. Adjusts bust/sweep balances. Service-role only. |
| `set_bets_pending()` | Bulk catchup: iterates all overdue active bets and calls `transition_bet_to_pending` for each. |
| `apply_bet_payouts()` | **Trigger function** — fires on `bet_proposals` UPDATE when status transitions to `resolved`. Distributes loser pot to winners, handles fractional-cent remainder via random assignment. |
| `refund_bet_points_on_wash()` | **Trigger function** — fires when `pending → washed`. Reverses the bust/sweep escrow set during the pending transition. |
| `resolution_enforce_no_winner_wash()` | **Trigger function** — BEFORE UPDATE. If a resolved bet has `winning_choice` that no participant guessed, force-washes the bet. |
| `set_bet_resolved_on_winning_choice()` | **Trigger function** — BEFORE UPDATE. When `winning_choice` is set (non-null), automatically flips status to `resolved`. |
| `handle_new_user()` | Trigger on `auth.users` INSERT → creates row in `public.users`. |
| `is_user_member_of_table(table_id, user_id)` | Stable helper for RLS policies. |
| `is_bet_open(bet_id)` | Returns true if bet is active and before close_time. |
| `enforce_immutable_bet_participation_fields()` | Prevents modification of bet_id, table_id, user_id on participations. |

### 4.4 Trigger Chain

The trigger chain on `bet_proposals` is critical and order-sensitive:

```
bet_proposals INSERT:
  BEFORE: set_bet_close_time()
  AFTER:  messages_sync_from_bet_proposals()
          touch_table_last_activity()

bet_proposals UPDATE:
  BEFORE: set_bet_close_time()
          set_bet_resolved_on_winning_choice()
          resolution_enforce_no_winner_wash()
  AFTER:  apply_bet_payouts()                        [resolved]
          refund_bet_points_on_wash()                 [pending → washed]
          create_system_message_on_bet_status_change() [any status change]
          create_system_message_on_bet_washed()        [washed]
          log_bet_status_transition()
          messages_sync_from_bet_proposals()
          touch_table_last_activity()
```

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
| `bet_proposals` | Table members | Proposer who is a member; must be active, no winning_choice | None (no delete) |
| `bet_participations` | Own rows always; others' after bet closes | Own participation in active open bets | None |
| `messages` | Table members or service_role | Table members or service_role | — |
| `text_messages` | Table members | Own messages as member | Own messages |
| `friends` | Own friendships | Own (user_id1 = self, no self-friendship) | Own |
| `friend_requests` | Sender or receiver | Sender only (no self-request) | — |
| `users` | Any authenticated user | Own profile only | — |
| `resolution_history` | Bet proposer or table members | — | — |
| `system_messages` | All (true) | Service role only (restricted to client false, but service_role insert true) | None (false) |

---

## 5. Server Architecture

### 5.1 Entry Point & Bootstrap

`server/src/index.ts` orchestrates the full startup sequence:

```
1. Express app creation
2. Middleware registration (CORS, JSON, requestId)
3. Route mounting (/api/*)
4. Error handler (tail middleware)
5. Server listen on PORT (default 5001)
6. Post-listen startup:
   a. startResolutionQueue()     — BullMQ worker
   b. startModeRuntime()         — all mode validators
   c. startBetLifecycleService() — Active→Pending timers
   d. startNflDataIngestService()— ESPN NFL polling
   e. startNbaDataIngestService()— ESPN NBA polling
7. Graceful shutdown (SIGTERM/SIGINT)
```

### 5.2 Middleware Stack

| Middleware | File | Purpose |
|---|---|---|
| `requestId` | `middleware/requestId.ts` | Attaches UUID to each request for log correlation |
| `requireAuth` | `middleware/auth.ts` | Extracts Bearer token, calls `supabase.auth.getUser()`, attaches `req.authUser` and a user-scoped `req.supabase` client |
| `rateLimitHeaders` | `middleware/rateLimitHeaders.ts` | Adds rate-limit response headers |
| `errorHandler` | `middleware/errorHandler.ts` | Catches `AppError` instances, returns structured JSON errors |
| `asyncHandler` | `middleware/errorHandler.ts` | Wraps async route handlers to forward thrown errors |

### 5.3 API Routes

All routes are under `/api` and protected by `requireAuth`:

| Method | Path | Controller | Purpose |
|---|---|---|---|
| POST | `/bet-proposals` | `betController.createBet` | Create a new bet proposal |
| GET | `/bet-proposals/:betId/participations` | `betController.getParticipations` | Get participations for a bet |
| PUT | `/bet-proposals/:betId/participations` | `betController.upsertParticipation` | Submit/update a user's guess |
| GET | `/tables` | `tableController.getUserTables` | List tables for the authenticated user |
| POST | `/tables` | `tableController.createTable` | Create a new table |
| DELETE | `/tables/:tableId` | `tableController.deleteTable` | Delete a table (host only) |
| GET | `/tables/:tableId/members` | `tableController.getTableMembers` | List members of a table |
| POST | `/tables/:tableId/members` | `tableController.addTableMember` | Add a member (host only) |
| DELETE | `/tables/:tableId/members` | `tableController.removeTableMember` | Remove a member |
| GET | `/tables/:tableId/sessions` | `tableController.getTableSessions` | Get bet sessions for a table |
| GET | `/tables/:tableId/bet-proposals` | `betController.getTableBets` | Get all bets for a table |
| GET | `/modes` | `modeController.getModes` | List all registered modes |
| GET | `/modes/preview` | `modeController.getModePreview` | Get live preview data for a specific mode |
| GET | `/tables/:tableId/messages` | `messageController.getMessages` | Paginated message history |
| POST | `/tables/:tableId/messages` | `messageController.sendMessage` | Send a chat message |
| GET | `/tickets` | `ticketController.getUserTickets` | Get user's bet history (tickets) |
| GET | `/friends` | `friendController.getFriends` | List friends |
| POST | `/friends/requests` | `friendController.sendFriendRequest` | Send a friend request |
| PUT | `/friends/requests/:requestId` | `friendController.respondToFriendRequest` | Accept/reject |

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

`server/src/services/bet/betLifecycleService.ts`

- **On startup:** Queries all active bets, schedules a `setTimeout` for each based on `close_time - now()`.
- **On timer fire:** Calls `transition_bet_to_pending(bet_id)` RPC.
- **Catchup cycle:** Every `BET_LIFECYCLE_CATCHUP_INTERVAL_MS` (default 60s), queries for any active bets past their close_time that were missed by mistake and transitions them.
- **New bet registration:** When a bet is created via the API, the service schedules a timer for it immediately.

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
- Retries: exponential backoff
- Connection: shared Redis instance

### 12.2 Rate Limiting

`server/src/infrastructure/rateLimiters.ts`

Redis-backed sliding-window rate limiters (singleton instances):

| Limiter | Window | Max Requests | Applied To |
|---|---|---|---|
| Message | 1 minute | 20 | Chat message sends |
| Friend | 1 minute | 10 | Friend request operations |
| Bet | 1 minute | (configurable) | Bet proposal creation |

When a limit is exceeded, an `AppError.tooManyRequests()` is thrown (429 status).

### 12.3 Redis Usage Summary

| Use Case | Key Pattern | Description |
|---|---|---|
| Game state cache | `nfl:game:{gameId}`, `nba:game:{gameId}` | Cached ESPN data for fast validator access |
| Validator store | `{storeKeyPrefix}:{betId}` | JSON blobs for baselines, progress, intermediate state |
| Rate limiters | `rl:{type}:{userId}` | Sliding-window counters |
| BullMQ | `bull:bet-resolution:*` | Job queue data structures |

### 12.4 Logging

**Server:** Structured `logger` utility with context-aware log methods:
```typescript
logger.info('Bet transitioned', { betId, from: 'active', to: 'pending' });
logger.error('Resolution failed', { betId, error });
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
   └─ Schedules setTimeout for (closeTime - now) ms

6. Client receives 201 Created
   └─ TanStack Query invalidates bets.byTable(tableId)
   └─ Supabase Realtime delivers INSERT event → UI updates

7. Other users see the bet appear in their table feed
   └─ They submit participations via PUT /api/bet-proposals/:betId/participations
```

### 13.2 Bet Resolution (End-to-End)

```
1. close_time reached → BetLifecycleService timer fires

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

## 14. Directory Reference

### Server (`server/src/`)

```
index.ts                          Express app entry point
supabaseClient.ts                 Admin + per-request Supabase clients
config/
  env.ts                          Zod-validated environment config
constants/
  betting.ts                      Bet-related constants
  environment.ts                  Environment detection
  errorMessages.ts                Standardized error message strings
controllers/
  betController.ts                Bet proposal + participation endpoints
  friendController.ts             Friend request endpoints
  messageController.ts            Chat message endpoints
  modeController.ts               Mode listing + preview endpoints
  tableController.ts              Table CRUD + member management
  ticketController.ts             Ticket/history endpoints
data/
  nflRefinedDataAccessors.ts      NFL stat extraction from ESPN data
  nbaRefinedDataAccessors.ts      NBA stat extraction from ESPN data
  nfl_data/                       NFL data schemas/files
  nba_data/                       NBA data schemas/files
infrastructure/
  rateLimiters.ts                 Redis rate limiter singletons
leagues/
  registry.ts                     Central mode registry
  types.ts                        Mode/league type definitions
  nfl/                            NFL mode modules (7 modes)
  nba/                            NBA mode modules (6 modes)
  u2pick/                         U2Pick mode modules (1 mode)
  sharedUtils/
    baseValidatorService.ts       Abstract validator base class
    modeRuntimeKernel.ts          Per-mode runtime (feeds + realtime)
    resolutionQueue.ts            BullMQ queue for bet resolution
    washService.ts                Wash detection logic
    betRepository.ts              Bet data access
    redisJsonStore.ts             Redis JSON storage helper
    resolveUtils.ts               Common resolution logic
    *Factory.ts                   Mode pattern factories (6 factories)
    spreadEvaluator.ts            Spread evaluation logic
    userConfigBuilder.ts          User-facing config generation
middleware/
  auth.ts                         Bearer token auth + user scoping
  errorHandler.ts                 AppError handling + asyncHandler
  requestId.ts                    Request ID generation
  rateLimitHeaders.ts             Rate limit response headers
routes/
  api.ts                          All API route definitions
services/
  bet/
    betLifecycleService.ts        Active→Pending timer management
  leagueData/
    index.ts                      Unified league data accessor
    registry.ts                   League data provider registration
    feeds/                        Game feed auto-registration
    kernel/                       Per-league data orchestration
  nflData/                        NFL ESPN polling service
  nbaData/                        NBA ESPN polling service
  dataIngest/                     Shared ingest utilities
types/
  express.d.ts                    Express request augmentation (authUser, supabase)
  league.ts                       League union type + normalizeLeague()
utils/
  gameId.ts                       Game ID parsing/generation
  logger.ts                       Structured logging utility
repositories/
  BaseRepository.ts               Abstract repository with pagination
  TableRepository.ts
  TicketRepository.ts
  MessageRepository.ts
  FriendRepository.ts
  UserRepository.ts
errors/
  AppError.ts                     Unified error class with static factories
tests/
  unit/                           Unit tests
  integration/                    Integration tests
  fixtures/                       Test data
  helpers/                        Test utilities
```

### Client (`client/src/`)

```
main.tsx                          React DOM entry point
App.tsx                           Route definitions (lazy-loaded)
vite-env.d.ts                     Vite type declarations
assets/
  global.css                      Global styles (Tailwind)
  *.png                           Static image assets
components/
  Bet/                            Bet-related presentational components
  Navbar/                         Navigation bar
  Social/                         Social/friend components
  Table/                          Table-related presentational components
data/
  clients/
    restClient.ts                 HTTP client with auth header injection
    supabaseClient.ts             Supabase browser client (anon key)
  repositories/
    betsRepository.ts             Bet REST API calls
    modesRepository.ts            Mode REST API calls
    tablesRepository.ts           Table REST API calls
    socialRepository.ts           Social REST API calls
    usersRepository.ts            User REST API calls
  subscriptions/
    tableSubscriptions.ts         Supabase Realtime channel management
  types/
    supabase.ts                   Generated Supabase database types
features/
  auth/                           AuthProvider, useAuth, auth types
  bets/
    hooks/                        TanStack Query hooks for bets
    service.ts                    Bet business logic
    mappers.ts                    Data transformation
    types.ts                      Bet domain types
    utils/                        Bet utilities
  table/
    hooks/                        TanStack Query hooks for tables
    hooks.ts                      Additional table hooks
    services/                     Table service layer
    chat/                         Chat feature
    types.ts                      Table domain types
  social/                         Friend hooks and types
pages/
  index.tsx                       Page barrel exports
  HomePage/
  TablesListPage/
  TableView/
  TicketsPage/
  AccountPage/
  NotFoundPage/
shared/
  hooks/
    useBetPhase.ts                Bet phase derivation
    useDialog.ts                  Dialog state management
    useDomTimer.ts                Countdown timer
    useIsMobile.ts                Responsive breakpoint
  types/                          Shared type definitions
  utils/
    dateTime.ts                   Date formatting
    error.ts                      Error utilities
    logger.ts                     Client logging factory
    number.ts                     Number formatting
  widgets/
    ErrorBoundary/                React error boundary
    FilterBar/                    Reusable filter component
  providers/
    QueryProvider.tsx             TanStack Query provider
  queryKeys.ts                    Centralized query key factories
```

---

*This document is generated from source analysis. For database-specific details, see `promptEngineering/supabase_schema/`, `supabase_functions/`, `supabase_row_level_security/`, and `supbase_triggers/`.*
