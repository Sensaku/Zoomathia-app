import { defineConfig, devices } from '@playwright/test'

const isCI = Boolean(process.env.CI)

/**
 * End-to-end tests run against the production build served by `vp preview`:
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
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !isCI,
  },
})
