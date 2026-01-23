// server
export const PORT = Number(process.env.PORT || 5001);
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173';

// supabase
export const SUPABASE_URL = process.env.SUPABASE_URL || '';
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

// redis
export const REDIS_URL = process.env.REDIS_URL || '';
export const RESOLUTION_QUEUE_CONCURRENCY = process.env.RESOLUTION_QUEUE_CONCURRENCY || '5';
export const USE_RESOLUTION_QUEUE = process.env.USE_RESOLUTION_QUEUE || 'true';

// nfl data
export const NFL_DATA_INTERVAL_SECONDS = Math.max(12, Number(process.env.NFL_DATA_INTERVAL_SECONDS) || 20);
export const NFL_DATA_RAW_JITTER_PERCENT = Math.max(5, Number(process.env.NFL_DATA_RAW_JITTER_PERCENT) || 10);
export const NFL_ROSTER_REFRESH_SECONDS = Math.max(24 * 60, Number(process.env.NFL_ROSTER_REFRESH_SECONDS) || 24 * 60 * 60);
export const BET_LIFECYCLE_CATCHUP_MS = Math.max(30_000, Number(process.env.BET_LIFECYCLE_CATCHUP_MS) || 60_000);
export const NFL_GAME_STATUS_POLL_MS = Math.max(30_000, Number(process.env.NFL_GAME_STATUS_POLL_MS) || 30_000);
export const NFL_DATA_TEST_MODE = ['raw', 'refined'].includes(String(process.env.NFL_DATA_TEST_MODE || 'off').trim().toLowerCase())
	? String(process.env.NFL_DATA_TEST_MODE || 'off').trim().toLowerCase()
	: 'off';

// nba data
export const NBA_DATA_INTERVAL_SECONDS = Math.max(12, Number(process.env.NBA_DATA_INTERVAL_SECONDS) || 20);
export const NBA_DATA_RAW_JITTER_PERCENT = Math.max(5, Number(process.env.NBA_DATA_RAW_JITTER_PERCENT) || 10);
export const NBA_DATA_TEST_MODE = ['raw', 'refined'].includes(String(process.env.NBA_DATA_TEST_MODE || 'off').trim().toLowerCase())
	? String(process.env.NBA_DATA_TEST_MODE || 'off').trim().toLowerCase()
	: 'off';

