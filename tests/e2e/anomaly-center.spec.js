// E2E tests for the AnomalyCenter UI (Session 7).
//
// Same approach as alerts-ui.spec.js and schedule-admin.spec.js: verify
// assets serve, public API is stable, and feature-flag gating works.
const { test, expect } = require('@playwright/test');

test.describe('AnomalyCenter assets', () => {
  test('anomaly-center.js is served and contains the public API', async ({ request }) => {
    const res = await request.get('/anomaly-center.js');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('AnomalyCenter');
    expect(body).toContain('drillDown');
    expect(body).toContain('openThresholdAdmin');
    // SSE handler — listens for 'anomaly' event type from the live-stream
    expect(body).toMatch(/addEventListener\(['"]anomaly['"]/);
  });

  test('anomaly-center.css is served and defines modal styles', async ({ request }) => {
    const res = await request.get('/anomaly-center.css');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('.an-modal');
    expect(body).toContain('.an-overlay');
    expect(body).toContain('.an-spark');
    expect(body).toContain('.an-thresh-card');
    expect(body).toContain('prefers-reduced-motion');
  });

  test('index.html links both anomaly-center assets', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('/anomaly-center.css');
    expect(html).toContain('/anomaly-center.js');
  });
});

test.describe('AnomalyCenter runtime', () => {
  test('window.AnomalyCenter is exposed after script loads', async ({ page }) => {
    await page.goto('/');
    const hasIt = await page.evaluate(() => typeof window.AnomalyCenter === 'object' && typeof window.AnomalyCenter.open === 'function');
    expect(hasIt).toBe(true);
  });

  test('AnomalyCenter public API is stable', async ({ page }) => {
    await page.goto('/');
    const apiKeys = await page.evaluate(() => Object.keys(window.AnomalyCenter || {}).sort());
    expect(apiKeys).toEqual([
      'close',
      'drillDown',
      'open',
      'openThresholdAdmin',
      'refresh'
    ]);
  });

  test('open() respects the anomalyDetectionV2 feature flag', async ({ page }) => {
    await page.goto('/');
    // Default flag is off — open() should bail without rendering the dashboard
    await page.evaluate(() => window.AnomalyCenter.open());
    const dashCount = await page.locator('#an-dashboard').count();
    if (dashCount > 0) {
      const display = await page.locator('#an-dashboard').evaluate(el => getComputedStyle(el).display);
      expect(display).toBe('none');
    } else {
      expect(dashCount).toBe(0);
    }
  });
});

test.describe('Anomaly API auth gates (Session 7 + 6 combined)', () => {
  // Session 7 doesn't add new endpoints — it consumes the Session 6 ones.
  // Re-verify the gates here as a regression check.
  const protectedEndpoints = [
    { method: 'GET',  path: '/api/anomalies/active' },
    { method: 'GET',  path: '/api/anomalies/recent?days=7' },
    { method: 'GET',  path: '/api/anomaly/thresholds' },
    { method: 'POST', path: '/api/anomalies/1/ack' }
  ];
  for (const ep of protectedEndpoints) {
    test(`${ep.method} ${ep.path} requires auth`, async ({ request }) => {
      const res = await request.fetch(ep.path, { method: ep.method });
      expect(res.status(), `${ep.method} ${ep.path} should require auth`).toBe(401);
    });
  }
});
