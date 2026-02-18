# Redis Key Namespace Reference

> All Redis keys used by the P2Picks server, organized by subsystem.
> Last updated: 2026-02-13

---

## Overview

The P2Picks server uses a single shared Redis instance for caching, rate limiting,
session storage, and job queues. This document catalogues every key pattern to
prevent namespace collisions and aid debugging.

---

## 1. BullMQ Queues

BullMQ uses the `bull:` prefix by default for all internal keys.

| Queue Name | Key Pattern | Purpose |
|---|---|---|
| `bet-resolution` | `bull:bet-resolution:*` | Bet resolution jobs (set_winning_choice, wash_bet, record_history) |
| `bet-lifecycle` | `bull:bet-lifecycle:*` | Delayed jobs for Active→Pending transition timers + catchup cycle |

**Internal BullMQ keys per queue** (auto-managed):
- `bull:<name>:id` — job ID counter
- `bull:<name>:stalled-check` — stalled job detection
- `bull:<name>:wait`, `:active`, `:completed`, `:failed`, `:delayed` — job state lists
- `bull:<name>:meta` — queue metadata
- `bull:<name>:events` — event stream
- `bull:<name>:<jobId>` — individual job data hash

---

## 2. Rate Limiters

Sliding-window rate limiters backed by sorted sets (Lua script).

| Limiter | Key Pattern | Window | Max |
|---|---|---|---|
| Messages | `ratelimit:messages:<userId>` | 60 s | 20 |
| Bets | `ratelimit:bets:<userId>` | 60 s | configurable |
| Friends | `ratelimit:friends:<userId>` | 60 s | 10 |

**Key type:** Sorted Set (ZADD/ZREMRANGEBYSCORE)
**TTL:** Auto-expires via ZREMRANGEBYSCORE on each check; no explicit TTL needed.

---

## 3. Config Sessions

Mode configuration wizard sessions (Redis-backed with write-through local cache).

| Key Pattern | TTL | Purpose |
|---|---|---|
| `config-session:<sessionId>` | `SESSION_TTL_MS` (default varies) | JSON blob of in-progress mode config session state |

**Key type:** String (SET with EX)
**Source:** `services/bet/configSessionService.ts`

---

## 3b. Idempotency Keys

Ensures duplicate POST requests with the same `Idempotency-Key` header
return the cached first-execution response instead of creating duplicate resources.

| Key Pattern | TTL | Purpose |
|---|---|---|
| `idempotency:<key>` | 24 h (86 400 s) | Cached response JSON (`{ statusCode, body }`) or `__processing__` sentinel while first request is in-flight |

**Key type:** String (SET NX with EX)
**Source:** `middleware/idempotency.ts`

---

## 4. Validator Stores (RedisJsonStore)

Each mode validator uses a `RedisJsonStore` to persist baselines, progress snapshots,
and intermediate state per bet. All keys follow the pattern `{prefix}:{betId}`.

### NFL Modes

| Mode | Prefix | TTL | Contents |
|---|---|---|---|
| Either/Or | `nfl_eitherOr:baseline` | 12 h | Baseline snapshot |
| Choose Their Fate | `nfl_choosefate:baseline` | 12 h | Baseline snapshot |
| Prop Hunt | `propHunt:baseline` | 12 h | Player stat baseline |
| Score Sorcerer | `nfl_scoreSorcerer:baseline` | 12 h | Score baseline |
| King of the Hill | `kingOfTheHill:progress` | 12 h | Stat-leader progress |
| Spread the Wealth | `spreadTheWealth:noop` | 12 h | Placeholder (no store needed) |
| Total Disaster | `totalDisaster:noop` | 12 h | Placeholder (no store needed) |

### NBA Modes

| Mode | Prefix | TTL | Contents |
|---|---|---|---|
| Either/Or | `nbaEitherOr:baseline` | 12 h | Baseline snapshot |
| Prop Hunt | `nbaPropHunt:baseline` | 12 h | Player stat baseline |
| Score Sorcerer | `nbaScoreSorcerer:baseline` | 12 h | Score baseline |
| King of the Hill | `nbaKingOfTheHill:progress` | 12 h | Stat-leader progress |
| Spread the Wealth | `nbaSpreadTheWealth:noop` | 12 h | Placeholder |
| Total Disaster | `nbaTotalDisaster:noop` | 12 h | Placeholder |

**Key type:** String (SET with EX)
**Source:** `leagues/sharedUtils/redisJsonStore.ts`

---

## 5. Summary — Prefix Ownership

| Prefix | Subsystem | Collision Risk |
|---|---|---|
| `bull:bet-resolution:*` | BullMQ resolution queue | None (managed by BullMQ) |
| `bull:bet-lifecycle:*` | BullMQ lifecycle queue | None (managed by BullMQ) |
| `ratelimit:messages:*` | Message rate limiter | None |
| `ratelimit:bets:*` | Bet rate limiter | None |
| `ratelimit:friends:*` | Friend rate limiter | None |
| `config-session:*` | Config session service | None |
| `idempotency:*` | Idempotency middleware | None |
| `propHunt:baseline:*` | NFL Prop Hunt validator | None |
| `nfl_scoreSorcerer:baseline:*` | NFL Score Sorcerer validator | None |
| `nfl_eitherOr:baseline:*` | NFL Either/Or validator | None |
| `nfl_choosefate:baseline:*` | NFL Choose Their Fate validator | None |
| `kingOfTheHill:progress:*` | NFL King of the Hill validator | None |
| `spreadTheWealth:noop:*` | NFL Spread the Wealth validator | None |
| `totalDisaster:noop:*` | NFL Total Disaster validator | None |
| `nbaPropHunt:baseline:*` | NBA Prop Hunt validator | None |
| `nbaScoreSorcerer:baseline:*` | NBA Score Sorcerer validator | None |
| `nbaEitherOr:baseline:*` | NBA Either/Or validator | None |
| `nbaKingOfTheHill:progress:*` | NBA King of the Hill validator | None |
| `nbaSpreadTheWealth:noop:*` | NBA Spread the Wealth validator | None |
| `nbaTotalDisaster:noop:*` | NBA Total Disaster validator | None |

**No collisions detected.** All prefixes are unique across subsystems.

---

## 6. Future: Multi-Tenant Key Prefix

For multi-tenant deployments, add a `REDIS_KEY_PREFIX` environment variable and
prepend it to all custom keys (rate limiters, config sessions, validator stores).
BullMQ supports a `prefix` option in its `Queue` / `Worker` constructors.

```typescript
// Example:
const queue = new Queue('bet-resolution', {
  connection: redis,
  prefix: process.env.REDIS_KEY_PREFIX || 'bull',
});
```
