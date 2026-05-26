// E2E tests for Bulk Admin Actions (Session 10).
//
// Same approach as alerts-ui / schedule-admin / anomaly-center: verify
// assets serve, public API is stable, auth gates work, and the action
// whitelist is enforced server-side.
const { test, expect } = require('@playwright/test');

test.describe('BulkActions assets', () => {
  test('bulk-actions.js is served and contains the public API', async ({ request }) => {
    const res = await request.get('/bulk-actions.js');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('BulkActions');
    expect(body).toContain('installMultiSelect');
    expect(body).toContain('open');
    // Idempotency requestId is generated client-side
    expect(body).toMatch(/requestId/);
  });

  test('bulk-actions.css is served and defines core selectors', async ({ request }) => {
    const res = await request.get('/bulk-actions.css');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('.ba-modal');
    expect(body).toContain('.ba-overlay');
    expect(body).toContain('.ba-toolbar');
    expect(body).toContain('.ba-result-row');
    expect(body).toContain('prefers-reduced-motion');
  });

  test('index.html links bulk-actions assets', async ({ request }) => {
    const res = await request.get('/');
    const html = await res.text();
    expect(html).toContain('/bulk-actions.css');
    expect(html).toContain('/bulk-actions.js');
  });

  test('sw.js pre-caches the new bulk-actions assets', async ({ request }) => {
    const res = await request.get('/sw.js');
    const body = await res.text();
    expect(body).toContain('/bulk-actions.js');
    expect(body).toContain('/bulk-actions.css');
    expect(body).toContain('adit-v1.6.0');
  });
});

test.describe('BulkActions runtime', () => {
  test('window.BulkActions is exposed', async ({ page }) => {
    await page.goto('/');
    const hasIt = await page.evaluate(() => typeof window.BulkActions === 'object' && typeof window.BulkActions.open === 'function');
    expect(hasIt).toBe(true);
  });

  test('BulkActions public API is stable', async ({ page }) => {
    await page.goto('/');
    // The `_selected` private field is included for tests — keep it stable
    const apiKeys = await page.evaluate(() => Object.keys(window.BulkActions || {}).sort());
    expect(apiKeys).toEqual([
      '_selected',
      'close',
      'installMultiSelect',
      'open',
      'refresh'
    ]);
  });

  test('open() respects the bulkActionsV2 feature flag', async ({ page }) => {
    await page.goto('/');
    // Default flag is off — open() should bail without rendering a modal
    await page.evaluate(() => window.BulkActions.open({ emails: ['x@adit.com'] }));
    const modalCount = await page.locator('#ba-picker').count();
    expect(modalCount).toBe(0);
  });
});

test.describe('Bulk Actions API — auth gates + validation', () => {
  test('POST /api/admin/bulk-actions requires admin (401 unauth)', async ({ request }) => {
    const res = await request.post('/api/admin/bulk-actions', {
      data: { action: 'notify', payload: { message: 'hi' }, emails: ['x@adit.com'] }
    });
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/admin/bulk-actions/list requires admin', async ({ request }) => {
    const res = await request.get('/api/admin/bulk-actions/list');
    expect([401, 403]).toContain(res.status());
  });

  // Without a session we can't directly test the 400/404 validation paths,
  // but the auth gate IS the first line of defense; positive validation tests
  // live in the unit test file (bulk-actions-engine.test.js) and run against
  // the action-handler shape exported via integration-friendly imports.
});
