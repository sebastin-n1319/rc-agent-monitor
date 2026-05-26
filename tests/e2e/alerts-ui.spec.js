// E2E tests for the Alert Center UI (Session 3).
//
// These tests focus on the UNAUTHENTICATED surface (the test environment has
// no Google OAuth) and on what we can verify by directly checking the
// served assets + the auth-gate behavior. Full UI flows behind auth are
// validated manually via the runbook for now; we'll add cookie-based test
// auth in a future session.
const { test, expect } = require('@playwright/test');

test.describe('Alert UI assets', () => {
  test('alert-center.js is served and contains the public API', async ({ request }) => {
    const res = await request.get('/alert-center.js');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('AlertCenter');
    expect(body).toContain('openHistory');
    expect(body).toContain('openThresholdAdmin');
    expect(body).toContain('requestNotificationPermission');
  });

  test('alert-center.css is served and defines the bell badge', async ({ request }) => {
    const res = await request.get('/alert-center.css');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('#ac-bell');
    expect(body).toContain('.ac-modal');
    expect(body).toContain('.ac-row');
    // Reduced motion respected
    expect(body).toContain('prefers-reduced-motion');
  });

  test('index.html links to alert-center.css and alert-center.js', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('/alert-center.css');
    expect(html).toContain('/alert-center.js');
  });
});

test.describe('Alert API auth-gates', () => {
  // All endpoints must 401 without a valid session cookie.
  // The actual alert engine + DB layer are unit-tested separately.
  const protectedEndpoints = [
    { method: 'GET',  path: '/api/alerts/active' },
    { method: 'GET',  path: '/api/alerts/recent' },
    { method: 'GET',  path: '/api/alerts/thresholds' },
    { method: 'POST', path: '/api/alerts/1/ack' },
    { method: 'POST', path: '/api/alerts/1/snooze?minutes=15' },
    { method: 'POST', path: '/api/alerts/ack-all' }
  ];
  for (const ep of protectedEndpoints) {
    test(`${ep.method} ${ep.path} requires auth`, async ({ request }) => {
      const res = await request.fetch(ep.path, { method: ep.method });
      expect(res.status(), `${ep.method} ${ep.path} should require auth`).toBe(401);
    });
  }

  const adminEndpoints = [
    { method: 'PUT',  path: '/api/alerts/thresholds/stuck_call' },
    { method: 'POST', path: '/api/admin/alerts/test' }
  ];
  for (const ep of adminEndpoints) {
    test(`${ep.method} ${ep.path} requires admin (401 without session)`, async ({ request }) => {
      const res = await request.fetch(ep.path, { method: ep.method });
      // Without session it's 401; with non-admin session it would be 403.
      expect([401, 403]).toContain(res.status());
    });
  }
});

test.describe('Alert Center runtime behavior (unauthenticated stub)', () => {
  test('login page renders and AlertCenter script does not init', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Adit Agent Monitor').first()).toBeVisible();

    // Without app-authenticated, init() should bail — no bell injected
    // because the status bar itself is hidden behind the login screen.
    const bell = page.locator('#ac-bell');
    await expect(bell).toHaveCount(0);

    // But the script should have loaded — window.AlertCenter exists
    const hasAlertCenter = await page.evaluate(() => typeof window.AlertCenter === 'object' && typeof window.AlertCenter.open === 'function');
    expect(hasAlertCenter).toBe(true);
  });

  test('AlertCenter API surface is stable', async ({ page }) => {
    await page.goto('/');
    const apiKeys = await page.evaluate(() => Object.keys(window.AlertCenter || {}).sort());
    expect(apiKeys).toEqual([
      'close',
      'open',
      'openHistory',
      'openThresholdAdmin',
      'refresh',
      'requestNotificationPermission'
    ]);
  });
});
