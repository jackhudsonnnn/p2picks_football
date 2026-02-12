/**
 * Unit Tests: Environment Configuration
 *
 * Tests for the environment validation utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('env configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules to clear cached env
    vi.resetModules();
    // Create a fresh env object
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getEnv', () => {
    it('should parse valid environment variables', async () => {
      process.env.NODE_ENV = 'test';
      process.env.PORT = '3000';
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
      process.env.SUPABASE_ANON_KEY = 'test-anon-key';
      process.env.REDIS_URL = 'redis://localhost:6379';

      const { getEnv } = await import('../../../src/config/env');
      const env = getEnv();

      expect(env.NODE_ENV).toBe('test');
      expect(env.PORT).toBe(3000);
      expect(env.SUPABASE_URL).toBe('https://test.supabase.co');
    });

    it('should use default values for optional variables', async () => {
      process.env.NODE_ENV = 'test';
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
      process.env.SUPABASE_ANON_KEY = 'test-anon-key';
      process.env.REDIS_URL = 'redis://localhost:6379';
      delete process.env.PORT;

      const { getEnv } = await import('../../../src/config/env');
      const env = getEnv();

      expect(env.PORT).toBe(5001); // Default
    });

    it('should coerce numeric values', async () => {
      process.env.NODE_ENV = 'test';
      process.env.PORT = '8080';
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
      process.env.SUPABASE_ANON_KEY = 'test-anon-key';
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.NFL_DATA_INTERVAL_SECONDS = '30';

      const { getEnv } = await import('../../../src/config/env');
      const env = getEnv();

      expect(typeof env.PORT).toBe('number');
      expect(env.PORT).toBe(8080);
      expect(typeof env.NFL_DATA_INTERVAL_SECONDS).toBe('number');
      expect(env.NFL_DATA_INTERVAL_SECONDS).toBe(30);
    });

    it('should transform boolean strings', async () => {
      process.env.NODE_ENV = 'test';
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
      process.env.SUPABASE_ANON_KEY = 'test-anon-key';
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.USE_RESOLUTION_QUEUE = 'false';

      const { getEnv } = await import('../../../src/config/env');
      const env = getEnv();

      expect(env.USE_RESOLUTION_QUEUE).toBe(false);
    });

    it('should normalize test mode values', async () => {
      process.env.NODE_ENV = 'test';
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
      process.env.SUPABASE_ANON_KEY = 'test-anon-key';
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.NFL_DATA_TEST_MODE = 'RAW'; // Should be normalized to lowercase

      const { getEnv } = await import('../../../src/config/env');
      const env = getEnv();

      expect(env.NFL_DATA_TEST_MODE).toBe('raw');
    });

    it('should default invalid test mode to off', async () => {
      process.env.NODE_ENV = 'test';
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
      process.env.SUPABASE_ANON_KEY = 'test-anon-key';
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.NFL_DATA_TEST_MODE = 'invalid';

      const { getEnv } = await import('../../../src/config/env');
      const env = getEnv();

      expect(env.NFL_DATA_TEST_MODE).toBe('off');
    });
  });
});
