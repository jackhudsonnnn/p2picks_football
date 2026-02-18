# P2Picks Server — Engineering TODO

> Generated from deep architecture review.
> Last updated: 2026-02-13

---

## 🚨 Critical / High Priority (Integrity, Security, Core Stability)

### Concurrency & Race Conditions

- [x] **`transition_bet_to_pending` — double-fire race.** ✅ Migrated to BullMQ delayed-job model (`betLifecycleQueue.ts`). Each bet gets exactly one job deduplicated by `lifecycle-{betId}`. Catchup is a repeatable BullMQ job.

- [x] **`apply_bet_payouts` trigger — floating-point payout distribution.** ✅ Balance columns migrated to `numeric(12,2)` in Phase 1. The existing RPC already had remainder distribution logic.

- [x] **`transition_bet_to_pending` — sweep_balance can go negative.** ✅ `CHECK (bust_balance >= 0)` constraint added in Phase 1.

- [x] **Rate limiter `check()` is not atomic.** ✅ Rewritten as a single Redis Lua script — ZREMRANGEBYSCORE + ZCARD + ZADD in one `redis.eval()` round-trip.

- [x] **`configSessionService` — in-memory session store is process-local.** ✅ Migrated to Redis-backed storage with write-through local cache. Sessions survive restarts and are accessible across replicas.

### Data Integrity

- [x] **`betRepository.washBet` — non-atomic wash + history.** ✅ Created `wash_bet_with_history` RPC that atomically washes the bet and records history in a single PostgreSQL transaction.

- [ ] **`refund_bet_points_on_wash` — division by zero guard.** The RPC uses `NULLIF(v_choice_count, 0)` which returns `NULL`, making `v_payout_share = NULL`. The subsequent `COALESCE(v_payout_share::double precision, 0)` silently swallows this, leaving balances incorrect. Add an explicit early-return or log a warning in `resolution_history` when this edge case occurs.

- [x] **`storeModeConfig` — race between insert and bet resolution.** ✅ Reordered in Phase 1: `storeModeConfig` now completes before `registerBetLifecycle` in both `createBetProposal` and `pokeBet`.

- [x] **`normalizeToHundredth` — IEEE-754 rounding artifacts.** ✅ Fixed in Phase 1 with string-based exponent rounding.

### Security

- [x] **`friendController.addFriend` — SQL injection via `or()` filter.** ✅ Fixed in Phase 3: `assertUuid()` guard validates all user IDs before `.or()` interpolation.

- [x] **No request body size limit.** ✅ Added `express.json({ limit: '100kb' })` in Phase 1.

- [ ] **`/api/health` endpoint is unprotected — information disclosure.** The health endpoint returns Redis latency, Supabase connectivity, and uptime. This is useful but should be protected in production (or return only `{ status }` to anonymous callers and full details to admin tokens).

- [x] **Missing Zod validation on controller request bodies.** ✅ Fixed in Phase 3: All write endpoints now have Zod schemas (`controllers/schemas.ts`) enforced via `validateBody(schema)` middleware. All path UUID params validated via `validateParams(schema)`.

- [x] **RLS policy audit — `system_messages_insert` allows `true`.** ✅ Fixed in Phase 1: dropped contradictory policy, replaced with table-member-scoped SELECT policy.

- [ ] **`bet_proposals` UPDATE RLS is `false/false` — service role bypass only.** This is intentional, but it means all bet updates (winning_choice, wash) *must* go through `getSupabaseAdmin()`. Verify every call path uses the service client and never the user-scoped `req.supabase`. Add an integration test that attempts `UPDATE bet_proposals` with an anon key and asserts failure.

---

## ⚠️ Medium Priority (Scalability, Error Handling, Refactoring)

### Failure Recovery & Resilience

- [x] **ESPN API circuit breaker.** ✅ Implemented `utils/circuitBreaker.ts` — a lightweight CLOSED→OPEN→HALF_OPEN state machine. Wired into both `nflDataIngestService` and `nbaDataIngestService` around all upstream API calls. Threshold: 5 failures, cooldown: 60s.

- [x] **BullMQ dead-letter queue (DLQ) alerting.** ✅ `worker.on('failed')` in `resolutionQueue.ts` now detects when `attemptsMade >= DEFAULT_RETRY_ATTEMPTS` and writes a `resolution_failed` event to `resolution_history` for the affected bet.

- [x] **Data ingest services lack exponential backoff on consecutive failures.** ✅ Adaptive backoff: `baseInterval × min(2^consecutiveFailures, 16)` in both NFL and NBA ingest services. Resets to base on first successful tick.

- [x] **`startResolutionQueue` can silently fail.** ✅ Added startup health probe — `queue.getWaitingCount()` immediately after queue creation in both `resolutionQueue.ts` and `betLifecycleQueue.ts`. Throws on failure.

- [x] **Graceful shutdown does not drain in-flight HTTP requests.** ✅ Captured `app.listen()` return value; unified `shutdown()` handler calls `server.close()` first, then stops all services, then `closeRedisClient()`.

- [x] **`stopBetLifecycleService` is not called during shutdown.** ✅ Fixed in Phase 2: wired `stopBetLifecycleService()` into both SIGTERM and SIGINT handlers in `index.ts`, before `stopResolutionQueue()`.

- [x] **NFL/NBA data ingest services are not stopped during shutdown.** ✅ Wired `stopNflDataIngestService()` and `stopNbaDataIngestService()` into the unified `shutdown()` handler in `index.ts`.

- [x] **Redis connection has no reconnect strategy.** ✅ Explicit `retryStrategy` in `redisClient.ts`: exponential backoff (500ms base, 30s cap), max 20 retries, then gives up and logs fatal error.

### Observability & Monitoring

- [x] **Replace `console.*` logger with a structured logging library.** ✅ Migrated to **pino** (v10.3) — JSON-structured logs with automatic `timestamp`, `level`, `requestId`, and `service` fields. Same `createLogger(prefix)` API preserved for drop-in compatibility.

- [x] **Add request-scoped logging context.** ✅ `requestIdMiddleware` now wraps `next()` inside `AsyncLocalStorage.run()` (`utils/requestContext.ts`). The pino root logger's `mixin()` function auto-injects `requestId` into every log line in the request scope — no manual parameter passing required.

- [x] **BullMQ queue depth metrics.** ✅ Lightweight Prometheus metrics system (`infrastructure/metrics.ts`) exposes `resolution_queue_depth` and `lifecycle_queue_depth` gauges, plus `http_requests_total`, `http_request_duration_ms`, and `external_api_duration_ms`. Served at `GET /metrics` in Prometheus text format.

- [x] **Health check should include BullMQ queue status.** ✅ `getHealthStatus()` now includes `bullmq: { resolutionWorker, lifecycleWorker }` via `isResolutionWorkerRunning()` and `isLifecycleWorkerRunning()`. Both must be running for `healthy` status; otherwise `degraded`.

- [x] **Add latency tracking to ESPN/NBA API calls.** ✅ `fetchJson()` in `espnClient.ts` and `runPythonJson()` in `nbaClient.ts` now record `Date.now()` timing and report latency via `externalApiDurationMs.observe()` histogram (labeled by provider and status).

### Code Quality & Refactoring

- [x] **Extract validation middleware.** ✅ Done in Phase 3: `validateBody(zodSchema)` and `validateParams(zodSchema)` in `middleware/validateRequest.ts`. Schemas centralized in `controllers/schemas.ts`.

- [ ] **Unify error handling in controllers.** `messageController.sendMessage` uses `try/catch` with manual `res.status(500)`, while routes using `asyncHandler` let errors propagate to `errorHandler`. Standardize all controllers to use `asyncHandler` + `AppError` throws. Remove internal `try/catch` blocks that swallow errors.

- [ ] **`errorHandler.ts` contains `requestIdMiddleware` — extract it.** The file exports both error handling and request ID middleware, violating single responsibility. The standalone `middleware/requestId.ts` also exists and is the one actually mounted. Deduplicate by removing the copy from `errorHandler.ts`.

- [ ] **`betController.createBetProposal` — 100+ line handler.** The handler validates input, checks membership, checks rate limits, normalizes league, and calls the service. Extract membership validation and rate-limit checking into composable middleware (e.g., `requireTableMembership`, `rateLimitBets`) applied at the route level.

- [ ] **Type-safety for `req.supabase` and `req.authUser`.** These are set via `requireAuth` middleware but typed via `express.d.ts` as possibly `undefined`. After `requireAuth` runs, they are guaranteed to exist. Create a typed wrapper (e.g., `getAuthContext(req): { supabase, user }`) that throws `AppError.unauthorized()` if missing, eliminating the repeated null checks in every controller.

- [ ] **`BetProposal` type is defined in `supabaseClient.ts`.** Domain types should live in `types/` or be auto-generated from Supabase. Move `BetProposal` to `types/bet.ts` and import from there. Consider using the Supabase CLI type generator (`generateSupabaseTypes.mjs` already exists in the client).

---

## 🔮 Future / Low Priority (Optimization, Nice-to-haves)

- [ ] **Idempotency keys for bet creation.** If the client retries a `POST /tables/:tableId/bets` due to a timeout, a duplicate bet can be created. Accept an `Idempotency-Key` header, store it in Redis with a short TTL, and return the cached response on re-request.

- [ ] **WebSocket push for bet lifecycle events.** The client subscribes to Supabase Realtime on the `messages` table, but resolution results (winning_choice set, wash) propagate through trigger-based system messages. Consider a direct server-push channel (Socket.IO or Supabase Realtime broadcast) for low-latency bet resolution notifications.

- [ ] **Mode config session — pre-warm game data.** `createModeConfigSession` lazily loads game context when `buildModePreview` is called. For leagues with expensive data lookups (NBA box scores), pre-fetch and cache game context when the session is created to reduce the latency of the first `applySessionChoice` call.

- [ ] **Bulk catchup — `set_bets_pending()` RPC.** The RPC exists but is never called from the server. `runCatchupCycle` manually queries active bets and calls `transition_bet_to_pending` one-by-one. For large catchup scenarios (server was down for hours), this is O(N) RPCs. Call `set_bets_pending()` as the first step of `hydrateActiveBets()`.

- [ ] **LRU cache eviction metrics.** `modeConfig.ts` uses `lru-cache` with `max: 1000`. There's no visibility into cache hit/miss rates. Add counters and periodically log the ratio to tune the cache size.

- [ ] **Pagination — switch to cursor-based for all list endpoints.** `tableController.listTables` and `messageController.listMessages` use cursor pagination, but `ticketController.listTickets` and `friendController.listFriendRequests` may not. Audit and standardize all list endpoints on cursor-based pagination for consistent performance at scale.

- [ ] **API versioning.** All routes are under `/api/`. When breaking changes are needed (e.g., changing the bet creation payload), there is no versioning strategy. Consider prefixing with `/api/v1/` now to allow a future `/api/v2/` migration path.

- [ ] **Admin-only endpoints for manual bet resolution.** If the automated resolution fails or produces an incorrect result, there is no way to manually override a bet's `winning_choice` or force a wash without direct DB access. Add protected admin endpoints: `POST /api/admin/bets/:betId/resolve`, `POST /api/admin/bets/:betId/wash`.

- [ ] **Table settlement workflow.** `table_members` has `allow_table_settlement_updates` RLS policy for hosts, but there is no server endpoint or service for table settlement. Design and implement the settlement flow (host triggers → balances zeroed → history recorded).

---

## 🛠 DevOps & Infrastructure

- [x] **Database migrations tooling.** ✅ Migration convention established: SQL files in `server/supabase/migrations/` (001, 002, …). Supabase CLI adoption documented in SYSTEM_ARCHITECTURE.md.

- [ ] **Automated database backups.** Supabase Pro plan includes daily backups, but there is no point-in-time recovery configuration documented. Enable PITR and document the restore procedure. For self-hosted deployments, add a `pg_dump` cron job.

- [x] **CI pipeline — lint, type-check, test, coverage gate.** ✅ GitHub Actions workflow (`.github/workflows/ci.yml`): ESLint → `tsc --noEmit` → `vitest run --coverage` → coverage threshold gate (70%). Runs on push/PR to `main`, uses Redis service container. ESLint configured for server (`eslint.config.mjs`, `typescript-eslint`).

- [x] **Dockerize the server.** ✅ Multi-stage `Dockerfile` (`node:20-alpine`): builder stage compiles TS → `dist/`, runner stage copies production deps + compiled JS. Non-root user, HEALTHCHECK on `/metrics`. `.dockerignore` excludes tests/coverage/node_modules. `docker-compose.yml` at repo root for local dev (Redis + server).

- [x] **Environment variable documentation.** ✅ `.env.example` rewritten with comprehensive descriptions for every variable — purpose, type, default, constraints, and security warnings.

- [ ] **Stale game data cleanup cron.** `nflDataIngestService` cleans up old raw/refined JSON files reactively during ticks, but if the service is stopped for a long time, files accumulate. Add a periodic cleanup job (BullMQ repeatable job or OS-level cron) that prunes files older than 24 hours.

- [x] **Redis key namespace audit.** ✅ Comprehensive documentation in `docs/REDIS_KEYS.md`: all 19 key prefixes catalogued (BullMQ queues, rate limiters, config sessions, 13 validator stores). No collisions detected. Multi-tenant prefix strategy documented.

- [x] **Load testing.** ✅ k6 smoke test script (`tests/load/k6-smoke.js`): ramp-up/sustained/spike stages, custom latency metrics, threshold gates (p95 < 500ms, error rate < 5%). Covers health, tables, bets, messages, members, tickets, modes, and metrics endpoints.

- [ ] **Dependency audit and update strategy.** Pin major versions in `package.json` and run `npm audit` in CI. Flag `@supabase/supabase-js` major version bumps (currently ^2.45/^2.49) which may introduce breaking Realtime changes.

---

## 📋 Implementation Phases

### Phase 1: Data Integrity & Safety Net (Week 1–2) ✅
> Goal: Eliminate data corruption vectors and money-math bugs.

1. ~~Migrate `bust_balance`, `push_balance`, `sweep_balance` columns from `float8` to `numeric(12,2)`.~~ ✅
2. ~~Add `CHECK (bust_balance >= 0)` constraint to `table_members`.~~ ✅
3. ~~Fix `normalizeToHundredth` floating-point rounding.~~ ✅
4. ~~Fix `system_messages` contradictory RLS policies.~~ ✅
5. ~~Add `express.json({ limit: '100kb' })`.~~ ✅
6. ~~Move `storeModeConfig` to execute before `registerBetLifecycle`.~~ ✅

> SQL migration: `server/supabase/migrations/001_phase1_data_integrity.sql`

### Phase 2: Concurrency & Atomicity (Week 2–3) ✅
> Goal: Eliminate race conditions under parallel load.

1. ~~Migrate bet lifecycle timers from `setTimeout` → BullMQ delayed jobs.~~ ✅
2. ~~Rewrite rate limiter `check()` as a single Redis Lua script.~~ ✅
3. ~~Wrap `washBet` + `recordHistory` in a single RPC/transaction.~~ ✅
4. ~~Migrate in-memory config sessions to Redis-backed store.~~ ✅
5. ~~Add remainder-distribution logic to `apply_bet_payouts`.~~ ✅ (already present in current RPC)

> SQL migration: `server/supabase/migrations/002_phase2_wash_bet_rpc.sql`

### Phase 3: Input Validation & Security Hardening (Week 3–4) ✅
> Goal: Enforce strict schemas at every entry point.

1. ~~Define Zod schemas for all POST/PUT request bodies.~~ ✅ (`controllers/schemas.ts`)
2. ~~Create `validateBody(schema)` and `validateParams(schema)` middleware.~~ ✅ (`middleware/validateRequest.ts`)
3. ~~Audit all `.or()` filter interpolations for injection safety.~~ ✅ (UUID `assertUuid()` guards in `friendController.ts`; cursor `.or()` calls already validated by parse functions)
4. ~~Add UUID format validation for all path parameters.~~ ✅ (Zod-based `validateParams` wired into all routes with UUID path params)
5. ~~Write unit tests for validation middleware and schemas.~~ ✅ (45 tests)

### Phase 4: Resilience & Recovery (Week 4–5) ✅
> Goal: Handle upstream failures gracefully.

1. ~~Implement circuit breaker for ESPN/NBA.com API calls.~~ ✅ (`utils/circuitBreaker.ts` — CLOSED→OPEN→HALF_OPEN state machine; wired into NFL + NBA ingest services)
2. ~~Add adaptive backoff to data ingest services.~~ ✅ (exponential backoff `baseInterval × 2^failures`, capped at 16×; resets on success)
3. ~~Wire all service stop functions into graceful shutdown.~~ ✅ (`index.ts` — `server.close()` for HTTP drain, `stopNflDataIngestService`, `stopNbaDataIngestService`, `closeRedisClient` added to unified `shutdown()` handler)
4. ~~Add startup health verification for BullMQ queue.~~ ✅ (`queue.getWaitingCount()` probe after creation in both `resolutionQueue.ts` and `betLifecycleQueue.ts`; throws on failure)
5. ~~Implement DLQ alerting for failed resolution jobs.~~ ✅ (`worker.on('failed')` in `resolutionQueue.ts` records `resolution_failed` event to `resolution_history` when all retries exhausted)
6. ~~Add explicit Redis reconnect strategy with capped retries.~~ ✅ (`redisClient.ts` — exponential backoff 500ms base / 30s cap, max 20 retries, then gives up)

### Phase 5: Observability (Week 5–6) ✅
> Goal: Production-grade logging and monitoring.

1. ~~Replace `console.*` logger with pino (structured JSON).~~ ✅ (`utils/logger.ts` — pino v10.3, JSON output, level-aware)
2. ~~Implement `AsyncLocalStorage` request context propagation.~~ ✅ (`utils/requestContext.ts` + `middleware/requestId.ts` — auto-injects `requestId` into all pino log lines)
3. ~~Expose `/metrics` endpoint (Prometheus format) with queue depth, API latency, cache hit rates.~~ ✅ (`infrastructure/metrics.ts` + `middleware/httpMetrics.ts` — Counter, Gauge, Histogram; served at `GET /metrics`)
4. ~~Add BullMQ worker health to the `/api/health` endpoint.~~ ✅ (`healthCheck.ts` — `bullmq.resolutionWorker` + `bullmq.lifecycleWorker`)
5. ~~Add latency instrumentation to all external API calls.~~ ✅ (`espnClient.ts` + `nbaClient.ts` — `externalApiDurationMs` histogram)

### Phase 6: DevOps & Operational Maturity (Week 6–8) ✅
> Goal: CI/CD, reproducible environments, and deployment confidence.

1. ~~Create GitHub Actions CI pipeline (lint → typecheck → test → coverage gate).~~ ✅ (`.github/workflows/ci.yml` — ESLint + tsc + vitest + coverage threshold)
2. ~~Dockerize the server with multi-stage build.~~ ✅ (`server/Dockerfile` — node:20-alpine, non-root, HEALTHCHECK; `docker-compose.yml` for local dev)
3. ~~Adopt Supabase CLI migrations for schema versioning.~~ ✅ (migration convention in `server/supabase/migrations/`)
4. ~~Create k6 load test scripts for critical paths.~~ ✅ (`tests/load/k6-smoke.js` — ramp/sustained/spike, latency thresholds)
5. ~~Document all Redis key namespaces.~~ ✅ (`docs/REDIS_KEYS.md` — 19 prefixes catalogued, no collisions)
6. ~~Document environment variables in `.env.example`.~~ ✅ (comprehensive descriptions for all vars)

### Phase 7: Product Polish & Future Features (Week 8+)
> Goal: Quality-of-life improvements and new capabilities.

1. ~~Implement idempotency keys for bet creation.~~ ✅ (`middleware/idempotency.ts` — `Idempotency-Key` header, Redis-backed SET NX with 24h TTL, concurrent-request 409 guard)
2. ~~Design and implement table settlement workflow.~~ ✅ (`services/table/tableSettlementService.ts` — host-only, checks active bets, zeroes balances, records `table_settlements` audit event; `POST /tables/:tableId/settle` endpoint)
3. ~~API versioning (`/api/v1/`).~~ ✅ (Routes mounted at `/api/v1` with `/api` as backward-compatible alias in `index.ts`)
4. ~~Pre-warm game data in config sessions.~~ ✅ (`services/bet/gameDataPreWarmer.ts` — fire-and-forget pre-fetch of game status, home/away teams on session creation)
