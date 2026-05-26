// E2E smoke tests — verifies the app boots and core routes respond.
// Auth-gated routes are checked by status code only (we don't have a
// test user yet). When we get one, this becomes the auth test suite.
const { test, expect } = require('@playwright/test');

test.describe('smoke', () => {
  test('/healthz returns 200 with expected JSON', async ({ request }) => {
    const res = await request.get('/healthz');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.server).toBe('ok');
    expect(body.ts).toBeGreaterThan(0);
  });

  test('login page renders with brand', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Adit Agent Monitor/);
    await expect(page.locator('text=Adit Agent Monitor').first()).toBeVisible();
  });

  test('manifest.webmanifest is served', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.short_name).toBe('Adit Monitor');
    expect(Array.isArray(body.icons)).toBe(true);
  });

  test('service worker file is served', async ({ request }) => {
    const res = await request.get('/sw.js');
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain('CACHE_VERSION');
  });

  test('auth-gated endpoints return 401 without session', async ({ request }) => {
    const endpoints = ['/api/agents', '/api/predict/abandonment', '/api/coach-flag/me'];
    for (const ep of endpoints) {
      const res = await request.get(ep);
      expect(res.status(), `${ep} should require auth`).toBe(401);
    }
  });
});
