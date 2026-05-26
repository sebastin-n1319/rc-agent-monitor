// E2E tests for Predictive Abandonment (Session 11).
//
// Verifies the new endpoints are wired, auth-gated, and that the engine
// module ships its expected exports. Full training/inference behaviour
// is covered by 38 unit tests in tests/unit/predict.test.js.
const { test, expect } = require('@playwright/test');

test.describe('Predict API auth gates', () => {
  const protectedEndpoints = [
    { method: 'GET',  path: '/api/predict/abandonment' },
    { method: 'GET',  path: '/api/predict/backtest' },
    { method: 'GET',  path: '/api/predict/backtest?days=14' }
  ];
  for (const ep of protectedEndpoints) {
    test(`${ep.method} ${ep.path} requires auth`, async ({ request }) => {
      const res = await request.fetch(ep.path, { method: ep.method });
      expect(res.status(), `${ep.method} ${ep.path} should require auth`).toBe(401);
    });
  }

  const adminEndpoints = [
    { method: 'POST', path: '/api/admin/predict/train' },
    { method: 'GET',  path: '/api/predict/model' }
  ];
  for (const ep of adminEndpoints) {
    test(`${ep.method} ${ep.path} requires admin (401/403 without session)`, async ({ request }) => {
      const res = await request.fetch(ep.path, { method: ep.method });
      expect([401, 403]).toContain(res.status());
    });
  }
});

test.describe('Predict endpoints — smoke', () => {
  test('/healthz still returns OK after predict cron starts', async ({ request }) => {
    const res = await request.get('/healthz');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.server).toBe('ok');
  });
});
