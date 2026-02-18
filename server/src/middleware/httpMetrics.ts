/**
 * HTTP Metrics Middleware
 *
 * Records request count and latency for every HTTP request.
 * Data is exposed via the `/metrics` Prometheus endpoint.
 */

import type { Request, Response, NextFunction } from 'express';
import { httpRequestsTotal, httpRequestDurationMs } from '../infrastructure/metrics';

export function httpMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const latencyMs = Date.now() - start;
    const labels = {
      method: req.method,
      path: normalizePath(req.route?.path ?? req.path),
      status: String(res.statusCode),
    };
    httpRequestsTotal.inc(labels);
    httpRequestDurationMs.observe(labels, latencyMs);
  });

  next();
}

/**
 * Normalise path to avoid high-cardinality labels.
 * Replaces UUID segments with `:id`.
 */
function normalizePath(p: string): string {
  return p.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ':id',
  );
}
