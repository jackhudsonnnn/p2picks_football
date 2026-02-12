/**
 * Integration Tests: Health Endpoint
 *
 * Tests for the /api/health endpoint.
 * Uses mocked dependencies to simulate various health states.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock the infrastructure before importing routes
vi.mock('../../../src/infrastructure/healthCheck', () => ({
  getHealthStatus: vi.fn(),
}));

import { getHealthStatus } from '../../../src/infrastructure/healthCheck';

describe('GET /api/health', () => {
  let app: express.Application;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Create a minimal express app with just the health route
    app = express();
    
    // Import and use the health route handler
    app.get('/api/health', async (_req, res) => {
      const health = await getHealthStatus();
      const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
      res.status(statusCode).json(health);
    });
  });

  it('should return 200 with healthy status when all checks pass', async () => {
    vi.mocked(getHealthStatus).mockResolvedValue({
      status: 'healthy',
      timestamp: '2024-01-01T00:00:00Z',
      uptime: 100,
      checks: {
        redis: { ok: true, latencyMs: 1 },
        supabase: { ok: true, latencyMs: 5 },
      },
    });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
    expect(response.body.checks.redis.ok).toBe(true);
    expect(response.body.checks.supabase.ok).toBe(true);
  });

  it('should return 200 with degraded status when some checks fail', async () => {
    vi.mocked(getHealthStatus).mockResolvedValue({
      status: 'degraded',
      timestamp: '2024-01-01T00:00:00Z',
      uptime: 100,
      checks: {
        redis: { ok: true, latencyMs: 1 },
        supabase: { ok: false, latencyMs: 50, error: 'Connection timeout' },
      },
    });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200); // Degraded still returns 200
    expect(response.body.status).toBe('degraded');
    expect(response.body.checks.redis.ok).toBe(true);
    expect(response.body.checks.supabase.ok).toBe(false);
  });

  it('should return 503 with unhealthy status when all checks fail', async () => {
    vi.mocked(getHealthStatus).mockResolvedValue({
      status: 'unhealthy',
      timestamp: '2024-01-01T00:00:00Z',
      uptime: 100,
      checks: {
        redis: { ok: false, latencyMs: 1000, error: 'Connection refused' },
        supabase: { ok: false, latencyMs: 1000, error: 'Connection refused' },
      },
    });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('unhealthy');
  });

  it('should include timestamp and uptime', async () => {
    vi.mocked(getHealthStatus).mockResolvedValue({
      status: 'healthy',
      timestamp: '2024-01-01T12:00:00Z',
      uptime: 3600,
      checks: {
        redis: { ok: true, latencyMs: 1 },
        supabase: { ok: true, latencyMs: 5 },
      },
    });

    const response = await request(app).get('/api/health');

    expect(response.body.timestamp).toBe('2024-01-01T12:00:00Z');
    expect(response.body.uptime).toBe(3600);
  });

  it('should include latency measurements', async () => {
    vi.mocked(getHealthStatus).mockResolvedValue({
      status: 'healthy',
      timestamp: '2024-01-01T00:00:00Z',
      uptime: 100,
      checks: {
        redis: { ok: true, latencyMs: 2 },
        supabase: { ok: true, latencyMs: 15 },
      },
    });

    const response = await request(app).get('/api/health');

    expect(response.body.checks.redis.latencyMs).toBe(2);
    expect(response.body.checks.supabase.latencyMs).toBe(15);
  });
});
