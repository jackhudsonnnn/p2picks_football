/**
 * P2Picks Server — k6 Load Test
 *
 * Simulates realistic traffic patterns against the API.
 *
 * Prerequisites:
 *   1. Install k6: https://grafana.com/docs/k6/latest/set-up/install-k6/
 *   2. Set environment variables (or pass via --env):
 *        K6_BASE_URL    — Server base URL (default: http://localhost:5001)
 *        K6_AUTH_TOKEN  — A valid Supabase JWT for an existing user
 *        K6_TABLE_ID    — A table ID the user belongs to
 *
 * Run:
 *   k6 run server/tests/load/k6-smoke.js \
 *     --env K6_AUTH_TOKEN="eyJ..." \
 *     --env K6_TABLE_ID="abc-123"
 *
 * Stages:
 *   • Ramp-up:   0 → 20 VUs over 30s
 *   • Sustained: 20 VUs for 2m
 *   • Spike:     20 → 50 VUs over 15s, hold 30s
 *   • Ramp-down: 50 → 0 over 15s
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ── Custom metrics ────────────────────────────────────────────────────────────
const errorRate = new Rate('errors');
const listTablesLatency = new Trend('list_tables_latency', true);
const listBetsLatency = new Trend('list_bets_latency', true);
const createBetLatency = new Trend('create_bet_latency', true);
const healthLatency = new Trend('health_latency', true);

// ── Configuration ─────────────────────────────────────────────────────────────
const BASE_URL = __ENV.K6_BASE_URL || 'http://localhost:5001';
const AUTH_TOKEN = __ENV.K6_AUTH_TOKEN || '';
const TABLE_ID = __ENV.K6_TABLE_ID || '';

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${AUTH_TOKEN}`,
};

// ── Test options ──────────────────────────────────────────────────────────────
export const options = {
  stages: [
    { duration: '30s', target: 20 },  // ramp up
    { duration: '2m', target: 20 },   // sustained load
    { duration: '15s', target: 50 },  // spike
    { duration: '30s', target: 50 },  // hold spike
    { duration: '15s', target: 0 },   // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    errors: ['rate<0.05'],                             // < 5% error rate
    list_tables_latency: ['p(95)<300'],
    list_bets_latency: ['p(95)<400'],
    health_latency: ['p(95)<100'],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function assertOk(res, name) {
  const ok = check(res, {
    [`${name} status 2xx`]: (r) => r.status >= 200 && r.status < 300,
    [`${name} has body`]: (r) => r.body && r.body.length > 0,
  });
  errorRate.add(!ok);
  return ok;
}

// ── Scenario ──────────────────────────────────────────────────────────────────
export default function () {
  // 1. Health check (unauthenticated)
  group('Health', () => {
    const res = http.get(`${BASE_URL}/api/health`);
    healthLatency.add(res.timings.duration);
    check(res, {
      'health status 200': (r) => r.status === 200,
    });
  });

  // 2. List tables
  group('List Tables', () => {
    const res = http.get(`${BASE_URL}/api/tables`, { headers });
    listTablesLatency.add(res.timings.duration);
    assertOk(res, 'GET /tables');
  });

  sleep(0.5);

  // 3. List bets for a table
  if (TABLE_ID) {
    group('List Bets', () => {
      const res = http.get(`${BASE_URL}/api/tables/${TABLE_ID}/bet-proposals`, {
        headers,
      });
      listBetsLatency.add(res.timings.duration);
      assertOk(res, 'GET /tables/:id/bet-proposals');
    });

    // 4. List messages
    group('List Messages', () => {
      const res = http.get(`${BASE_URL}/api/tables/${TABLE_ID}/messages`, {
        headers,
      });
      assertOk(res, 'GET /tables/:id/messages');
    });

    // 5. List members
    group('List Members', () => {
      const res = http.get(`${BASE_URL}/api/tables/${TABLE_ID}/members`, {
        headers,
      });
      assertOk(res, 'GET /tables/:id/members');
    });
  }

  sleep(1);

  // 6. List tickets
  group('List Tickets', () => {
    const res = http.get(`${BASE_URL}/api/tickets`, { headers });
    assertOk(res, 'GET /tickets');
  });

  // 7. List modes
  group('List Modes', () => {
    const res = http.get(`${BASE_URL}/api/modes`, { headers });
    assertOk(res, 'GET /modes');
  });

  sleep(0.5);

  // 8. Metrics endpoint (unauthenticated)
  group('Metrics', () => {
    const res = http.get(`${BASE_URL}/metrics`);
    check(res, {
      'metrics status 200': (r) => r.status === 200,
      'metrics is prometheus format': (r) =>
        r.body && r.body.includes('http_requests_total'),
    });
  });

  sleep(Math.random() * 2);
}
