# P2Picks Local Server

A tiny Express server that serves data-updater functions over HTTP for the client.

## Endpoints
- GET /health
- GET /api/games
- GET /api/games/:gameId/players
- GET /api/modes/:mode
- GET /api/games/:gameId/player/:playerId/:category
- GET /api/games/:gameId/team/:teamId/:category

## Config
- PORT (default 5001)
- DATA_REFINED_DIR: path to the folder of refined JSON files. Defaults to `../data/nfl_refined_live_stats` relative to the server folder.

## Run
1. Install deps:
   - From the `server` folder: `npm install`
2. Start dev:
   - `npm run dev`

Health check: http://localhost:5001/health

## Notes
- Designed for local dev. For production, build (`npm run build`) then run `npm start`.
