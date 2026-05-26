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
      include: ['lib/**/*.js', 'database.js', 'server.js'],
      exclude: ['node_modules', 'tests', 'public'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        statements: 50,
        branches: 40,
        functions: 50,
        lines: 50
      }
    },
    reporters: ['default'],
    testTimeout: 10000
  }
});
