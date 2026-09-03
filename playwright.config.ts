import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

// Load .env.local so globalSetup can access Supabase keys (Node 20.12+ built-in)
try {
  (process as any).loadEnvFile(path.join(__dirname, '.env.local'));
} catch {
  // Fallback: parse manually
  const fs = require('fs');
  const envPath = path.join(__dirname, '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

/**
 * NisFlow Finance - Playwright E2E Configuration
 *
 * Prerequisites:
 *   1. Dev server running: npm run dev (port 3000)
 *   2. Migration 027 applied to Supabase (trigger fix)
 *   3. globalSetup auto-signs in test user on first run; reuses cached state after.
 *
 * Run: npx playwright test --reporter=list
 */
export default defineConfig({
  testDir: './playwright/e2e',
  globalSetup: './playwright/global-setup.ts',
  globalTeardown: './playwright/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    storageState: undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
