// E2E tests for PredictCenter UI (Session 12).
//
// Same pattern as the other UI modules: verify assets serve, public API
// is stable, feature-flag gating works, and the Session 11 endpoints are
// still auth-gated (regression check after wiring the new UI).
const { test, expect } = require('@playwright/test');

test.describe('PredictCenter assets', () => {
  test('predict-center.js is served and contains the public API', async ({ request }) => {
    const res = await request.get('/predict-center.js');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('PredictCenter');
    expect(body).toContain('retrain');
    expect(body).toContain('renderBacktest');
    expect(body).toContain('renderForecast');
  });

  test('predict-center.css is served and defines forecast styles', async ({ request }) => {
    const res = await request.get('/predict-center.css');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('.pc-modal');
    expect(body).toContain('.pc-overlay');
    expect(body).toContain('.pc-forecast');
    expect(body).toContain('.pc-band');
    expect(body).toContain('.pc-bt-chart');
    expect(body).toContain('prefers-reduced-motion');
  });

  test('index.html links predict-center assets', async ({ request }) => {
    const res = await request.get('/');
    const html = await res.text();
    expect(html).toContain('/predict-center.css');
    expect(html).toContain('/predict-center.js');
  });

  test('sw.js pre-caches predict-center assets', async ({ request }) => {
    const res = await request.get('/sw.js');
    const body = await res.text();
    expect(body).toContain('/predict-center.js');
    expect(body).toContain('/predict-center.css');
    // Version-agnostic — v1.7 was Session 12, future bumps shouldn't break this
    expect(body).toMatch(/CACHE_VERSION\s*=\s*['"]adit-v1\.[7-9]/);
  });
});

test.describe('PredictCenter runtime', () => {
  test('window.PredictCenter is exposed after script loads', async ({ page }) => {
    await page.goto('/');
    const hasIt = await page.evaluate(() => typeof window.PredictCenter === 'object' && typeof window.PredictCenter.open === 'function');
    expect(hasIt).toBe(true);
  });

  test('PredictCenter public API is stable', async ({ page }) => {
    await page.goto('/');
    const apiKeys = await page.evaluate(() => Object.keys(window.PredictCenter || {}).sort());
    expect(apiKeys).toEqual(['close', 'open', 'refresh', 'retrain']);
  });

  test('open() respects the predictiveAbandonmentV2 feature flag', async ({ page }) => {
    await page.goto('/');
    // Default flag is off — open() bails without rendering the modal
    await page.evaluate(() => window.PredictCenter.open());
    const modalCount = await page.locator('#pc-modal').count();
    if (modalCount > 0) {
      const display = await page.locator('#pc-modal').evaluate(el => getComputedStyle(el).display);
      expect(display).toBe('none');
    } else {
      expect(modalCount).toBe(0);
    }
  });
});

test.describe('Predict API auth gates (regression)', () => {
  test('GET /api/predict/abandonment still requires auth', async ({ request }) => {
    const res = await request.get('/api/predict/abandonment');
    expect(res.status()).toBe(401);
  });
  test('GET /api/predict/backtest still requires auth', async ({ request }) => {
    const res = await request.get('/api/predict/backtest');
    expect(res.status()).toBe(401);
  });
  test('POST /api/admin/predict/train still requires admin', async ({ request }) => {
    const res = await request.post('/api/admin/predict/train');
    expect([401, 403]).toContain(res.status());
  });
});
