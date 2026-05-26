// Vitest config — unit & integration tests for server-side logic.
// E2E tests live in /tests/e2e and use Playwright (see playwright.config.js).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.{js,mjs}'],
    exclude: ['node_modules', 'dist', '.git'],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      // Only measure code that has dedicated unit tests. database.js and
      // server.js are covered by Playwright E2E tests instead; including
      // them here would skew metrics. Add modules here once they have
      // a corresponding tests/unit/*.test.js.
      include: ['lib/**/*.js'],
      exclude: ['node_modules', 'tests', 'public'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        statements: 75,
        branches: 70,
        functions: 70,
        lines: 75
      }
    },
    reporters: ['default'],
    testTimeout: 10000
  }
});
