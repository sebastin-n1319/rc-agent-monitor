// E2E tests for the Schedule Admin UI (Session 5).
//
// Same approach as alerts-ui.spec.js: verify assets serve, public API is
// stable, and endpoints are auth-gated. Full UI flows behind auth are
// validated manually via the runbook until we add test-auth.
const { test, expect } = require('@playwright/test');

test.describe('Schedule Admin assets', () => {
  test('schedule-admin.js is served and contains the public API', async ({ request }) => {
    const res = await request.get('/schedule-admin.js');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('ScheduleAdmin');
    expect(body).toContain('editSchedule');
    expect(body).toContain('openBulkApply');
  });

  test('schedule-admin.css is served and defines modal styles', async ({ request }) => {
    const res = await request.get('/schedule-admin.css');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('.sa-modal');
    expect(body).toContain('.sa-overlay');
    expect(body).toContain('.sa-week-row');
    expect(body).toContain('.sa-timeline');
    expect(body).toContain('prefers-reduced-motion');
  });

  test('index.html links both schedule-admin assets', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('/schedule-admin.css');
    expect(html).toContain('/schedule-admin.js');
  });
});

test.describe('Schedule API auth-gates', () => {
  const protectedEndpoints = [
    { method: 'GET',  path: '/api/schedule-adherence' },
    { method: 'GET',  path: '/api/schedule-adherence/x@adit.com' },
    { method: 'GET',  path: '/api/schedules/x@adit.com' }
  ];
  for (const ep of protectedEndpoints) {
    test(`${ep.method} ${ep.path} requires auth`, async ({ request }) => {
      const res = await request.fetch(ep.path, { method: ep.method });
      expect(res.status(), `${ep.method} ${ep.path} should require auth`).toBe(401);
    });
  }

  const adminEndpoints = [
    { method: 'GET',  path: '/api/schedules' },
    { method: 'GET',  path: '/api/schedules/x@adit.com/history' },
    { method: 'PUT',  path: '/api/schedules/x@adit.com' },
    { method: 'POST', path: '/api/schedules/bulk' },
    { method: 'DELETE', path: '/api/schedules/x@adit.com' }
  ];
  for (const ep of adminEndpoints) {
    test(`${ep.method} ${ep.path} requires admin (401/403 without session)`, async ({ request }) => {
      const res = await request.fetch(ep.path, { method: ep.method });
      expect([401, 403]).toContain(res.status());
    });
  }
});

test.describe('ScheduleAdmin runtime behavior', () => {
  test('window.ScheduleAdmin is exposed after script loads', async ({ page }) => {
    await page.goto('/');
    const hasIt = await page.evaluate(() => typeof window.ScheduleAdmin === 'object' && typeof window.ScheduleAdmin.open === 'function');
    expect(hasIt).toBe(true);
  });

  test('ScheduleAdmin public API is stable', async ({ page }) => {
    await page.goto('/');
    const apiKeys = await page.evaluate(() => Object.keys(window.ScheduleAdmin || {}).sort());
    expect(apiKeys).toEqual([
      'close',
      'editSchedule',
      'open',
      'openBulkApply',
      'refresh'
    ]);
  });

  test('open() respects the scheduleAdherenceV2 feature flag', async ({ page }) => {
    await page.goto('/');
    // Default flag is off — open() should bail without rendering the dashboard
    await page.evaluate(() => window.ScheduleAdmin.open());
    const dashCount = await page.locator('#sa-dashboard').count();
    // Either the dashboard wasn't created (count 0) or it's display:none
    if (dashCount > 0) {
      const display = await page.locator('#sa-dashboard').evaluate(el => getComputedStyle(el).display);
      expect(display).toBe('none');
    } else {
      expect(dashCount).toBe(0);
    }
  });
});
