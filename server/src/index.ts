import express from 'express';
import cors, { CorsOptions } from 'cors';
import 'dotenv/config';
import apiRouter from './routes/api';
import { startModeRuntime, stopModeRuntime } from './services/leagueData';
import { startNflDataIngestService } from './services/nflData/nflDataIngestService';
import { startNbaDataIngestService } from './services/nbaData/nbaDataIngestService';
import { startBetLifecycleService } from './services/bet/betLifecycleService';
import { startResolutionQueue, stopResolutionQueue } from './leagues/sharedUtils/resolutionQueue';
import { requireAuth } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { requestIdMiddleware } from './middleware/requestId';
import { env } from './config/env';
import { createLogger } from './utils/logger';

const logger = createLogger('server');

assertRequiredEnv();

const app = express();

const corsOptions: CorsOptions = buildCorsOptions();
app.use(cors(corsOptions));
app.use(express.json());
app.use(requestIdMiddleware);

app.use('/api', requireAuth, apiRouter);

// Global error handler - must be last middleware
app.use(errorHandler);

app.listen(env.PORT, () => {
  startResolutionQueue();
  startModeRuntime().catch((err) => {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, 'Failed to start mode runtime');
    process.exit(1);
  });
  startBetLifecycleService();
  startNflDataIngestService();
  startNbaDataIngestService();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info({}, 'SIGTERM received, shutting down...');
  stopModeRuntime();
  await stopResolutionQueue();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info({}, 'SIGINT received, shutting down...');
  stopModeRuntime();
  await stopResolutionQueue();
  process.exit(0);
});

function assertRequiredEnv(): void {
  // Validation now handled by Zod schema in config/env.ts
  // This function is kept for backward compatibility but does nothing
}

function buildCorsOptions(): CorsOptions {
  const allowedOrigins = resolveAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
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
