import express from 'express';
import cors, { CorsOptions } from 'cors';
import 'dotenv/config';
import apiRouter from './routes/api';
import { startModeRuntime, stopModeRuntime } from './services/leagueData';
import { startNflDataIngestService, stopNflDataIngestService } from './services/nflData/nflDataIngestService';
import { startNbaDataIngestService, stopNbaDataIngestService } from './services/nbaData/nbaDataIngestService';
import { startBetLifecycleService, stopBetLifecycleService } from './services/bet/betLifecycleService';
import { startResolutionQueue, stopResolutionQueue } from './leagues/sharedUtils/resolutionQueue';
import { requireAuth } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { requestIdMiddleware } from './middleware/requestId';
import { env } from './config/env';
import { createLogger } from './utils/logger';
import { closeRedisClient } from './utils/redisClient';
import { httpMetricsMiddleware } from './middleware/httpMetrics';
import { renderMetrics } from './infrastructure/metrics';

const logger = createLogger('server');

assertRequiredEnv();

const app = express();

const corsOptions: CorsOptions = buildCorsOptions();
app.use(cors(corsOptions));
app.use(express.json({ limit: '100kb' }));
app.use(requestIdMiddleware);
app.use(httpMetricsMiddleware);

// Prometheus metrics endpoint (no auth — lightweight, no sensitive data)
app.get('/metrics', (_req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(renderMetrics());
});

app.use('/api/v1', requireAuth, apiRouter);
app.use('/api', requireAuth, apiRouter); // backward-compatible alias

// Global error handler - must be last middleware
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  startResolutionQueue().catch((err) => {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, 'Failed to start resolution queue');
    process.exit(1);
  });
  startModeRuntime().catch((err) => {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, 'Failed to start mode runtime');
    process.exit(1);
  });
  startBetLifecycleService();
  startNflDataIngestService();
  startNbaDataIngestService();
});

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutdown signal received, draining…');

  // 1. Stop accepting new connections & drain in-flight HTTP requests
  server.close(() => {
    logger.info({}, 'HTTP server closed');
  });

  // 2. Stop services
  stopModeRuntime();
  await Promise.all([
    stopBetLifecycleService(),
    stopResolutionQueue(),
    stopNflDataIngestService(),
    stopNbaDataIngestService(),
  ]);

  // 3. Close shared Redis (after queues are done)
  closeRedisClient();

  logger.info({}, 'Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => { shutdown('SIGTERM'); });
process.on('SIGINT', () => { shutdown('SIGINT'); });

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
