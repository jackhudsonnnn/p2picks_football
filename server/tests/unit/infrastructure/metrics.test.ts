import { describe, it, expect } from 'vitest';
import { renderMetrics, httpRequestsTotal, httpRequestDurationMs, externalApiDurationMs } from '../../../src/infrastructure/metrics';

describe('metrics', () => {
  it('renders Prometheus text format for counters', () => {
    httpRequestsTotal.inc({ method: 'GET', path: '/api/health', status: '200' });
    httpRequestsTotal.inc({ method: 'GET', path: '/api/health', status: '200' });
    httpRequestsTotal.inc({ method: 'POST', path: '/api/bets', status: '201' });

    const output = renderMetrics();

    expect(output).toContain('# TYPE p2picks_http_requests_total counter');
    expect(output).toContain('p2picks_http_requests_total{method="GET",path="/api/health",status="200"} 2');
    expect(output).toContain('p2picks_http_requests_total{method="POST",path="/api/bets",status="201"} 1');
  });

  it('renders Prometheus text format for histograms', () => {
    httpRequestDurationMs.observe({ method: 'GET', path: '/api/health', status: '200' }, 42);

    const output = renderMetrics();

    expect(output).toContain('# TYPE p2picks_http_request_duration_ms histogram');
    expect(output).toContain('p2picks_http_request_duration_ms_count{method="GET",path="/api/health",status="200"} 1');
    expect(output).toContain('p2picks_http_request_duration_ms_sum{method="GET",path="/api/health",status="200"} 42');
    // 42ms should land in the 50ms bucket
    expect(output).toContain('p2picks_http_request_duration_ms_bucket{method="GET",path="/api/health",status="200",le="50"} 1');
  });

  it('renders external API histogram', () => {
    externalApiDurationMs.observe({ provider: 'espn', status: 'ok' }, 150);

    const output = renderMetrics();

    expect(output).toContain('# TYPE p2picks_external_api_duration_ms histogram');
    expect(output).toContain('p2picks_external_api_duration_ms_count{provider="espn",status="ok"}');
  });

  it('renderMetrics returns all registered metrics', () => {
    const output = renderMetrics();

    // Should include all registered metric families
    expect(output).toContain('p2picks_http_requests_total');
    expect(output).toContain('p2picks_http_request_duration_ms');
    expect(output).toContain('p2picks_external_api_duration_ms');
    expect(output).toContain('p2picks_resolution_queue_depth');
    expect(output).toContain('p2picks_lifecycle_queue_depth');
    expect(output).toContain('p2picks_circuit_breaker_state');
  });
});
