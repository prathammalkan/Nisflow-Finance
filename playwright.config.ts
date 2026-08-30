import { defineConfig, devices } from '@playwright/test';

/**
 * NisFlow Finance — Playwright E2E Test Configuration
 * Tests run against the local dev server (http://localhost:3000).
 * For CI: set BASE_URL env var to your staging deployment URL.
 */
export default defineConfig({
  testDir: './playwright/e2e',
  fullyParallel: false, // Run sequentially to avoid session conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    // Never store credentials in env-exposed locations
    storageState: undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Dev server is started manually before running E2E tests
  // webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true }
});
