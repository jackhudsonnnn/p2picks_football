# P2Picks Football

P2Picks is a peer-to-peer, points-based football betting experience where friends gather in private **Tables** to propose wagers, debate outcomes, and settle their ledgers together.

## Contents
- [What is P2Picks?](#what-is-p2picks)
- [For Players](#for-players)
- [For Developers](#for-developers)
- [Project Structure](#project-structure)
- [Additional Resources](#additional-resources)

## What is P2Picks?
P2Picks replaces traditional sportsbooks with a democratic bet flow within tables (groupchats):

- **Propose Bets:** Any table member can spin up a bet by selecting a mode, configuring the inputs, and setting a countdown timer.
- **Join & Adjust:** While the bet is **Active**, teammates may enter or change their pick in real time.
- **Lock & Validate:** Once the timer expires the bet becomes **Pending** until the underlying event resolves, then flips to **Resolved** or **Washed** based on outcomes.
- **Payouts:** Winners split the losers’ pot evenly; odd points are distributed randomly until the remainder hits zero.
- **Wash Conditions:** Bets wash if nobody participates, everyone passes, everyone picks the same option, or the result has no winners.
- **Session Settlement:** Table hosts can finalize a session once all bets resolve, resetting balances and posting a settlement ledger for real-world reconciliation.

The current catalog includes four bet modes sourced from live ESPN football data:
1. **Either Or** – head-to-head stat race between two players until halftime or final whistle.
2. **Difference In Opinion** – predict the final score differential bucket (0-3, 4-10, 11-25, 26+).
3. **Choose Their Fate** – call the outcome of the current drive.
4. **Scorcerer** – guess the type of the next score.

## For Players

### Introduction & Purpose
Run private, points-based betting tables with your friends. Every participant keeps the same virtual bankroll, wagers points instead of cash, and can flex between structured bet modes that keep the game night lively.

### Installation & Setup
1. **Clone the repository**
	```bash
	git clone https://github.com/jackhudsonnnn/p2picks_football.git
	cd p2picks_football
	```
2. **Create a Supabase project** and grab your Project URL, anon key, and service key.
3. **Provision Redis** (Upstash, Docker, or any hosted instance) for validator coordination.
4. **Configure environment files** by copying the provided examples:
	```bash
	cp client/.env.example client/.env
	cp server/.env.example server/.env
	```
	Update both files with your Supabase credentials, Redis URL, and optional stats server endpoint.
5. **Install dependencies**
	```bash
	(cd client && npm install)
	(cd server && npm install)
	```
6. **Run the stack** (two terminals recommended)
	```bash
	cd server && npm run dev
	```
	```bash
	cd client && npm run dev
	```
7. Open the client URL printed by Vite (defaults to `http://localhost:5174`) and sign in with any Supabase-authenticated account.

### Basic Usage
1. **Join or create a Table** from the home screen.
2. **Propose a bet** by selecting one of the modes and configuring the event details.
3. **Invite friends to join**—they can switch their selection any time before the timer expires.
4. **Watch the state flow** from Active ➜ Pending ➜ Resolved/Washed as live data streams in from ESPN.
5. **Settle the session** once all bets resolve to zero out point balances and post the ledger summary.

### Troubleshooting & Support
- **Server refuses to start:** Verify every key in `server/.env` is populated; the server fails fast when Supabase or Redis credentials are missing.
- **Client stuck on loading:** Confirm the Supabase URL and anon key match your project and that CORS is enabled for `localhost` in the Supabase dashboard.
- **Stats look stale:** Check the stats server URL and ensure the background data sync (`server/src/services/nflGameStatusSyncService.ts`) is running without Redis timeouts.
- **Need help?** Open a GitHub issue in this repository or start a discussion thread with reproduction details.

## For Developers

### Project Overview
- **Client (`client/`):** React + TypeScript app bootstrapped with Vite. Handles authentication, table chat, bet proposals, and live state updates.
- **Server (`server/`):** Express + TypeScript broker that validates bets, enforces Supabase Row Level Security, coordinates Redis-backed validators, and hydrates game data from ESPN.
- **Supabase:** Acts as the primary data store, hosts RPC functions, triggers system messages, and enforces per-user access via policies.
- **promptEngineering/** & **supabase\_*** directories:** Contain automation scripts to snapshot Supabase schema, security rules, cron jobs, and edge functions—treat these as infrastructure as code.
- **prototypes/** and **server/src/data/** house experiments and data pipelines for ingesting and refining live NFL statistics.

### Development Setup
1. Install Node.js ≥ 20 and pnpm or npm (project scripts use npm by default).
2. Configure the `.env` files as described in the player setup section.
3. Optional: run `npm run build` in both `client` and `server` to confirm TypeScript outputs cleanly.
4. Use the recommended workflow:
	- Start Redis locally (e.g., `docker run -p 6379:6379 redis:7`), or point to a remote instance.
	- Start the server with `npm run dev` (Hot reload via `ts-node-dev`).
	- Start the client with `npm run dev` (Vite with React Fast Refresh).
	- Keep Supabase Studio open to inspect bet state transitions and table messages.

### Contribution Guidelines
- Fork or branch off `main`; keep branches focused on a single feature or bugfix.
- Run `npm run lint` and `npm run build` in `client/` plus `npm run build` in `server/` before opening a pull request.
- Add or update tests when introducing server validators or client hooks (see `client/src/features` and `server/src/services`).
- Follow the existing TypeScript coding conventions: descriptive types in `shared/`, React hooks in `features/.../hooks`, and server logic encapsulated under `services/`.
- Write concise pull request descriptions that outline the user-facing impact and validation steps; link to any relevant Supabase schema changes captured in `promptEngineering/`.

### Technical Details
- **Bet State Machine:** Server transitions bets between Active, Pending, Resolved, and Washed; Supabase triggers emit system messages for each transition.
- **Mode Registry:** `server/src/modes/registry.ts` wires individual betting modes so new modes can be added without touching the validator core.
- **Live Data:** `server/src/services/gameDataService.ts` and related scripts maintain the ESPN data mirrors under `server/src/data/`.
- **Redis Usage:** Used for caching live stats, coordinating validators, and throttling updates.
- **Client Architecture:** Feature folders under `client/src/features` expose typed hooks (`auth`, `bets`, `tables`, `social`) consumed by page-level components.
- **Styling:** Currently CSS, planning to migrate to Tailwind CSS v4 (via PostCSS).
- **Infrastructure Snapshots:** SQL and JSON files under `promptEngineering/` capture Supabase policies, cron jobs, and functions for reproducible deployments.

## Project Structure
```
p2picks_football/
├── client/                 # React Vite client (pages, features, widgets)
├── server/                 # Express server with Supabase + Redis integrations
├── promptEngineering/      # Supabase schema snapshots & automation scripts
├── prototypes/             # Exploratory docs and UX experiments
└── README.md               # You're here
```

## Additional Resources
- Supabase Docs: <https://supabase.com/docs>
- React Docs: <https://react.dev>
- TypeScript Handbook: <https://www.typescriptlang.org/docs>
- ESPN Unofficial API (community reference): <https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b>

---

Have a feature idea or question? Open an issue, start a discussion, or drop a PR—Table hosts everywhere will thank you.
