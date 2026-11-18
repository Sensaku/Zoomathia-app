import { defineConfig, devices } from '@playwright/test'

const isCI = Boolean(process.env.CI)

/**
 * End-to-end tests run against the production build served by `vp preview`, which relays `/api`
 * to a real backend on a temporary database and a fake Corese (`e2e/fixtures/README.md`):
 * run `npm run build` first, then `npm run test:e2e`.
 */
export default defineConfig({
  testDir: './e2e',
  forbidOnly: isCI,
  // A flaky test is fixed or removed, never retried.
  retries: 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    // The app picks the browser language: the journeys read the French interface.
    locale: 'fr-FR',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // The journeys share one database: no parallel workers.
  workers: 1,
  // Never reuse a running server: a dev backend may use data/staging.db.
  webServer: [
    {
      command:
        'uv run python -m tests.e2e.stack --api-port 3101 --corese-port 3102 --fixtures ../frontend/e2e/fixtures',
      cwd: '../backend-fastapi',
      url: 'http://127.0.0.1:3101/',
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'npm run preview -- --port 4173 --strictPort --host 127.0.0.1',
      url: 'http://127.0.0.1:4173',
      env: { API_PROXY_TARGET: 'http://127.0.0.1:3101' },
      reuseExistingServer: false,
    },
  ],
})
