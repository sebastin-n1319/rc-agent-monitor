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
      // Global floor (current actual is 89%+). Per-file floors below
      // lock in the bar each engine cleared, so future PRs can't quietly
      // drop coverage. Update when a module legitimately needs lower
      // coverage and document why.
      thresholds: {
        // Global — caught by all-files aggregate
        statements: 85,
        branches: 80,
        functions: 80,
        lines: 85,
        // Per-file — locks each library to its current bar (Session 13)
        'lib/alerts.js':   { statements: 98, branches: 78, functions: 100, lines: 98 },
        'lib/anomaly.js':  { statements: 95, branches: 89, functions: 100, lines: 95 },
        'lib/predict.js':  { statements: 98, branches: 85, functions: 100, lines: 98 },
        'lib/schedule.js': { statements: 95, branches: 91, functions: 100, lines: 95 },
        // logger.js + offline-queue.js have lower coverage by design
        // (error-tracker middleware + IDB layer are tested via E2E)
        'lib/logger.js':         { statements: 60, branches: 75, functions: 40, lines: 60 },
        'lib/offline-queue.js':  { statements: 60, branches: 75, functions: 85, lines: 60 }
      }
    },
    reporters: ['default'],
    testTimeout: 10000
  }
});
