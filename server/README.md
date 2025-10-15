# P2Picks Server

This package is the Supabase-aware backend that the P2Picks client calls to propose bets, render mode previews, and keep long-running validators in sync with live NFL data. It is a TypeScript/Express service that boots background workers alongside the HTTP API.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Basic uptime probe. |
| GET | `/api/bet-proposals/bootstrap` | Returns selectable NFL games (from refined stats files) and the available bet modes. |
| GET | `/api/bet-modes` | Lists all bet mode definitions. |
| GET | `/api/bet-modes/:modeKey` | Returns a single mode definition. |
| POST | `/api/bet-modes/:modeKey/user-config` | Generates next-step UI hints for configuring a bet mode. |
| POST | `/api/bet-modes/:modeKey/preview` | Builds a preview (summary, options, validation errors) for a mode configuration. |
| POST | `/api/tables/:tableId/bets` | Creates a bet proposal, validates mode config, and stores the prepared config. |
| POST | `/api/bets/:betId/mode-config` | Stores an updated prepared mode configuration for an existing bet. |
| GET | `/api/bets/:betId/mode-config` | Retrieves the most recent stored mode configuration for a bet. |
| POST | `/api/mode-config/batch` | Fetches stored configs for a batch of bet IDs. |

All responses are JSON. Request bodies are parsed via `express.json()`.

## Background jobs

- **Mode validators** – Each mode spins up a validator service on boot. They subscribe to Supabase realtime changes and/or watch the refined stats directory to resolve pending bets or wash them according to the rules in `promptEngineering/p2picks.md`.
- **NFL game status sync** – Polls refined stats to track game status transitions and upserts the latest status into the `nfl_games` table.

Both services currently assume the refined stats JSON set is available on the local filesystem at runtime.

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `PORT` | No (default `5001`) | Express HTTP listener port. |
| `SUPABASE_URL` | Yes | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Credential used by the server-side Supabase client (service role required). |
| `REDIS_URL` | Yes (validator services) | Connection string for Redis; validator services fail fast without it. |
| `NFL_GAME_STATUS_POLL_MS` | No | Polling interval (ms) for the game status sync worker. |
| `DEBUG_MODE_OPTIONS`, `DEBUG_SCORE_STATS`, `SCORCERER_STORE_RAW` | No | Opt-in debug/profiling flags for specific subsystems. |
| `CORS_ALLOWED_ORIGINS` | No | Comma-separated list of allowed origins for CORS (defaults to local Vite dev URLs). |

The service expects refined stats JSON files under `src/data/nfl_refined_live_stats`. Update `helpers.ts#REFINED_DIR` if the directory moves.

## Development

```bash
cd server
npm install
npm run dev
```

This starts the Express app with `ts-node-dev`, enabling hot reloads. Visit http://localhost:5001/health to verify the server is running.

## Build & start

```bash
cd server
npm run build
npm start
```

Build emits compiled JavaScript in `dist/`. Make sure the background workers can reach your Supabase project and the refined stats dataset before deploying.
