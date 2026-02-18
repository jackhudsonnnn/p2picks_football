/**
 * Unit Tests: Health Check
 *
 * Tests for the health check utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the dependencies before importing
vi.mock('../../../src/utils/redisClient', () => ({
  getRedisClient: vi.fn(),
}));

vi.mock('../../../src/supabaseClient', () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('../../../src/leagues/sharedUtils/resolutionQueue', () => ({
  isResolutionWorkerRunning: vi.fn(() => true),
}));

vi.mock('../../../src/services/bet/betLifecycleQueue', () => ({
  isLifecycleWorkerRunning: vi.fn(() => true),
}));

import {
  checkRedisHealth,
  checkSupabaseHealth,
  getHealthStatus,
} from '../../../src/infrastructure/healthCheck';
import { getRedisClient } from '../../../src/utils/redisClient';
import { getSupabaseAdmin } from '../../../src/supabaseClient';
import { isResolutionWorkerRunning } from '../../../src/leagues/sharedUtils/resolutionQueue';
import { isLifecycleWorkerRunning } from '../../../src/services/bet/betLifecycleQueue';

describe('healthCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkRedisHealth', () => {
    it('should return ok:true when Redis responds with PONG', async () => {
      const mockRedis = {
        ping: vi.fn().mockResolvedValue('PONG'),
      };
      vi.mocked(getRedisClient).mockReturnValue(mockRedis as any);

      const result = await checkRedisHealth();
      
      expect(result.ok).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    it('should return ok:false when Redis returns unexpected response', async () => {
      const mockRedis = {
        ping: vi.fn().mockResolvedValue('UNEXPECTED'),
      };
      vi.mocked(getRedisClient).mockReturnValue(mockRedis as any);

      const result = await checkRedisHealth();
      
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Unexpected');
    });

    it('should return ok:false when Redis throws error', async () => {
      const mockRedis = {
        ping: vi.fn().mockRejectedValue(new Error('Connection refused')),
      };
      vi.mocked(getRedisClient).mockReturnValue(mockRedis as any);

      const result = await checkRedisHealth();
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Connection refused');
    });
  });

  describe('checkSupabaseHealth', () => {
    it('should return ok:true when Supabase query succeeds', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };
      vi.mocked(getSupabaseAdmin).mockReturnValue(mockSupabase as any);

      const result = await checkSupabaseHealth();
      
      expect(result.ok).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return ok:false when Supabase query fails', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ 
              data: null, 
              error: { message: 'Connection failed', code: 'PGRST000' } 
            }),
          }),
        }),
      };
      vi.mocked(getSupabaseAdmin).mockReturnValue(mockSupabase as any);

      const result = await checkSupabaseHealth();
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Connection failed');
    });

    it('should return ok:true for RLS permission errors (indicates connection works)', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ 
              data: null, 
              error: { message: 'Permission denied', code: 'PGRST301' } 
            }),
          }),
        }),
      };
      vi.mocked(getSupabaseAdmin).mockReturnValue(mockSupabase as any);

      const result = await checkSupabaseHealth();
      
      // RLS errors mean we connected successfully
      expect(result.ok).toBe(true);
    });
  });

  describe('getHealthStatus', () => {
    it('should return healthy when all checks pass', async () => {
      const mockRedis = { ping: vi.fn().mockResolvedValue('PONG') };
      vi.mocked(getRedisClient).mockReturnValue(mockRedis as any);

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };
      vi.mocked(getSupabaseAdmin).mockReturnValue(mockSupabase as any);

      const status = await getHealthStatus();
      
      expect(status.status).toBe('healthy');
      expect(status.checks.redis.ok).toBe(true);
      expect(status.checks.supabase.ok).toBe(true);
      expect(status.checks.bullmq.resolutionWorker).toBe(true);
      expect(status.checks.bullmq.lifecycleWorker).toBe(true);
      expect(status.timestamp).toBeDefined();
      expect(status.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return degraded when some checks fail', async () => {
      const mockRedis = { ping: vi.fn().mockResolvedValue('PONG') };
      vi.mocked(getRedisClient).mockReturnValue(mockRedis as any);

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ 
              data: null, 
              error: { message: 'Failed', code: 'ERROR' } 
            }),
          }),
        }),
      };
      vi.mocked(getSupabaseAdmin).mockReturnValue(mockSupabase as any);

      const status = await getHealthStatus();
      
      expect(status.status).toBe('degraded');
      expect(status.checks.redis.ok).toBe(true);
      expect(status.checks.supabase.ok).toBe(false);
    });

    it('should return degraded when BullMQ workers are down but Redis/Supabase ok', async () => {
      const mockRedis = { ping: vi.fn().mockResolvedValue('PONG') };
      vi.mocked(getRedisClient).mockReturnValue(mockRedis as any);

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };
      vi.mocked(getSupabaseAdmin).mockReturnValue(mockSupabase as any);
      vi.mocked(isResolutionWorkerRunning).mockReturnValue(false);
      vi.mocked(isLifecycleWorkerRunning).mockReturnValue(false);

      const status = await getHealthStatus();
      
      expect(status.status).toBe('degraded');
      expect(status.checks.bullmq.resolutionWorker).toBe(false);
      expect(status.checks.bullmq.lifecycleWorker).toBe(false);
    });

    it('should return unhealthy when all checks fail', async () => {
      const mockRedis = { ping: vi.fn().mockRejectedValue(new Error('Failed')) };
      vi.mocked(getRedisClient).mockReturnValue(mockRedis as any);

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ 
              data: null, 
              error: { message: 'Failed', code: 'ERROR' } 
            }),
          }),
        }),
      };
      vi.mocked(getSupabaseAdmin).mockReturnValue(mockSupabase as any);
      vi.mocked(isResolutionWorkerRunning).mockReturnValue(false);
      vi.mocked(isLifecycleWorkerRunning).mockReturnValue(false);

      const status = await getHealthStatus();
      
      expect(status.status).toBe('unhealthy');
      expect(status.checks.redis.ok).toBe(false);
      expect(status.checks.supabase.ok).toBe(false);
    });
  });
});
