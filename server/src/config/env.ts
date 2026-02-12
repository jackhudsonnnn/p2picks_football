/**
 * Environment Configuration
 *
 * Validates and exports typed environment variables using Zod.
 * Fails fast on startup if required variables are missing or invalid.
 *
 * Usage:
 *   import { env } from '../config/env';
 *   console.log(env.PORT); // number, guaranteed to be valid
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Schema Definition
// ─────────────────────────────────────────────────────────────────────────────

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5001),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),

  // Supabase (required)
  SUPABASE_URL: z.url().min(1, 'SUPABASE_URL is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),

  // Redis (required)
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // Resolution Queue
  RESOLUTION_QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(5),
  USE_RESOLUTION_QUEUE: z
    .string()
    .transform((val) => val.toLowerCase() === 'true')
    .default(true),

  // NFL Data Ingest
  NFL_DATA_INTERVAL_SECONDS: z.coerce.number().int().min(12).default(20),
  NFL_DATA_RAW_JITTER_PERCENT: z.coerce.number().int().min(5).default(10),
  NFL_ROSTER_REFRESH_SECONDS: z.coerce
    .number()
    .int()
    .min(24 * 60)
    .default(24 * 60 * 60),
  BET_LIFECYCLE_CATCHUP_MS: z.coerce.number().int().min(30_000).default(60_000),
  NFL_GAME_STATUS_POLL_MS: z.coerce.number().int().min(30_000).default(30_000),
  NFL_DATA_TEST_MODE: z
    .string()
    .transform((val) => {
      const normalized = val.trim().toLowerCase();
      return ['raw', 'refined'].includes(normalized) ? normalized : 'off';
    })
    .default('off'),

  // NBA Data Ingest
  NBA_DATA_INTERVAL_SECONDS: z.coerce.number().int().min(12).default(20),
  NBA_DATA_RAW_JITTER_PERCENT: z.coerce.number().int().min(5).default(10),
  NBA_DATA_TEST_MODE: z
    .string()
    .transform((val) => {
      const normalized = val.trim().toLowerCase();
      return ['raw', 'refined'].includes(normalized) ? normalized : 'off';
    })
    .default('off'),
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

/**
 * Get the validated environment configuration.
 * Parses on first call and caches the result.
 * Throws if validation fails.
 */
export function getEnv(): Env {
  if (_env) {
    return _env;
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');
    throw new Error(`❌ Environment validation failed:\n${errors}`);
  }

  _env = result.data;
  return _env;
}

/**
 * Validate environment on import for fail-fast behavior.
 * In test environment, we allow partial configs.
 */
function validateOnStartup(): void {
  try {
    getEnv();
  } catch (error) {
    // In test mode, we may not have all env vars set
    if (process.env.NODE_ENV === 'test') {
      console.warn('[env] Skipping strict validation in test mode');
      return;
    }
    console.error((error as Error).message);
    process.exit(1);
  }
}

// Only validate on startup in non-test environments
if (process.env.NODE_ENV !== 'test') {
  validateOnStartup();
}

// Export a lazy-evaluated env object for convenience
export const env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return getEnv()[prop as keyof Env];
  },
});
