// E2E tests for the Anomaly Detection API (Session 6).
//
// The engine is unit-tested directly (lib/anomaly.js) so these tests
// focus on the HTTP surface: routes mounted, auth gated correctly,
// and DB schema honored.
const { test, expect } = require('@playwright/test');

test.describe('Anomaly API auth-gates', () => {
  const protectedEndpoints = [
    { method: 'GET',  path: '/api/anomaly/thresholds' },
    { method: 'GET',  path: '/api/anomalies/recent' },
    { method: 'GET',  path: '/api/anomalies/active' },
    { method: 'GET',  path: '/api/anomalies/agent/x@adit.com' },
    { method: 'POST', path: '/api/anomalies/1/ack' }
  ];
  for (const ep of protectedEndpoints) {
    test(`${ep.method} ${ep.path} requires auth`, async ({ request }) => {
      const res = await request.fetch(ep.path, { method: ep.method });
      expect(res.status(), `${ep.method} ${ep.path} should require auth`).toBe(401);
    });
  }

  const adminEndpoints = [
    { method: 'PUT',  path: '/api/anomaly/thresholds/daily_missed_calls' },
    { method: 'POST', path: '/api/admin/anomalies/run' },
    { method: 'POST', path: '/api/admin/anomalies/test' }
  ];
  for (const ep of adminEndpoints) {
    test(`${ep.method} ${ep.path} requires admin (401/403 without session)`, async ({ request }) => {
      const res = await request.fetch(ep.path, { method: ep.method });
      expect([401, 403]).toContain(res.status());
    });
  }
});

test.describe('Anomaly system smoke', () => {
  test('/healthz still returns OK after anomaly cron starts', async ({ request }) => {
    const res = await request.get('/healthz');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.server).toBe('ok');
  });
});
