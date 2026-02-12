/**
 * Health Check Utilities
 *
 * Provides health check functions for application dependencies.
 * Used by the /health endpoint to report detailed status.
 */

import { getRedisClient } from '../utils/redisClient';
import { getSupabaseAdmin } from '../supabaseClient';
import { createLogger } from '../utils/logger';

const logger = createLogger('healthCheck');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface HealthCheckResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    redis: HealthCheckResult;
    supabase: HealthCheckResult;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual Health Checks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check Redis connectivity by sending a PING command.
 */
export async function checkRedisHealth(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const redis = getRedisClient();
    const result = await redis.ping();
    const latencyMs = Date.now() - start;

    if (result === 'PONG') {
      return { ok: true, latencyMs };
    }

    return { ok: false, latencyMs, error: `Unexpected PING response: ${result}` };
  } catch (error) {
    const latencyMs = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ error: message }, 'Redis health check failed');
    return { ok: false, latencyMs, error: message };
  }
}

/**
 * Check Supabase connectivity by querying a lightweight table.
 */
export async function checkSupabaseHealth(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const supabase = getSupabaseAdmin();

    // Query a system table or do a simple count
    // Using a limit 1 query on a table we know exists
    const { error } = await supabase.from('users').select('user_id').limit(1);

    const latencyMs = Date.now() - start;

    if (error) {
      // RLS errors are expected for service role on some tables
      // A connection error would have different characteristics
      if (error.code === 'PGRST301' || error.code === '42501') {
        // Permission denied is fine - we connected successfully
        return { ok: true, latencyMs };
      }
      return { ok: false, latencyMs, error: error.message };
    }

    return { ok: true, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ error: message }, 'Supabase health check failed');
    return { ok: false, latencyMs, error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregated Health Check
// ─────────────────────────────────────────────────────────────────────────────

const startTime = Date.now();

/**
 * Run all health checks and return aggregated status.
 */
export async function getHealthStatus(): Promise<HealthStatus> {
  const [redis, supabase] = await Promise.all([
    checkRedisHealth(),
    checkSupabaseHealth(),
  ]);

  const allOk = redis.ok && supabase.ok;
  const anyOk = redis.ok || supabase.ok;

  let status: HealthStatus['status'];
  if (allOk) {
    status = 'healthy';
  } else if (anyOk) {
    status = 'degraded';
  } else {
    status = 'unhealthy';
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks: {
      redis,
      supabase,
    },
  };
}
