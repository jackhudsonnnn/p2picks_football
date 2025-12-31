import express from 'express';
import cors, { CorsOptions } from 'cors';
import 'dotenv/config';
import apiRouter from './routes/api';
import { startModeValidators } from './services/bet/modeValidatorService';
import { startNflGameStatusSync } from './services/nflData/nflGameStatusSyncService';
import { startNflDataIngestService } from './services/nflData';
import { startBetLifecycleService } from './services/bet/betLifecycleService';
import { startResolutionQueue, stopResolutionQueue } from './modes/shared/resolutionQueue';
import { requireAuth } from './middleware/auth';

assertRequiredEnv();

const app = express();
const PORT = Number(process.env.PORT || 5001);

const corsOptions: CorsOptions = buildCorsOptions();
app.use(cors(corsOptions));
app.use(express.json());

app.use('/api', requireAuth, apiRouter);

app.listen(PORT, () => {
  // Start resolution queue first (validators depend on it)
  startResolutionQueue();
  startModeValidators();
  startNflGameStatusSync();
  startBetLifecycleService();
  startNflDataIngestService();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[server] SIGTERM received, shutting down...');
  await stopResolutionQueue();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[server] SIGINT received, shutting down...');
  await stopResolutionQueue();
  process.exit(0);
});

function assertRequiredEnv(): void {
  const missing: string[] = [];
  if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!process.env.SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
  if (!process.env.REDIS_URL) missing.push('REDIS_URL');
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
}

function buildCorsOptions(): CorsOptions {
  const allowedOrigins = resolveAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
  const allowAll = allowedOrigins.has('*');

  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowAll || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  };
}

function resolveAllowedOrigins(raw: string | undefined): Set<string> {
  if (raw && raw.trim().length) {
    return new Set(
      raw
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    );
  }
  return new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);
}
