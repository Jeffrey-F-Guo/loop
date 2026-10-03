import { defineConfig, devices } from '@playwright/test';

const db = process.env.E2E_DATABASE_URL ?? 'postgres://sprint:sprint@localhost:5433/sprint_e2e?sslmode=disable';

export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:8091',
    viewport: { width: 1440, height: 900 },
    timezoneId: 'America/Los_Angeles',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `cd ../api && DATABASE_URL='${db}' AUTH_MODE=dev APP_ENV=test PORT=8090 CORS_ORIGINS=http://localhost:8091 go run ./cmd/server`,
      url: 'http://localhost:8090/healthz',
      timeout: 180_000,
      reuseExistingServer: false,
    },
    { command: 'node serve-app.mjs', url: 'http://localhost:8091', timeout: 30_000, reuseExistingServer: false },
  ],
});
