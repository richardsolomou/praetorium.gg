import os from 'node:os'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173)
const baseURL = `http://127.0.0.1:${port}`
const root = process.env.PLAYWRIGHT_DATA_ROOT ?? path.join(os.tmpdir(), `praetorium-playwright-${port}`)
// The synced catalogue, so list building is exercised against the real data.
const catalogue = process.env.CATALOGUE_DIR ?? path.join(import.meta.dirname, 'catalogue-data')
const rules = process.env.RULES_DIR ?? path.join(import.meta.dirname, 'catalogue-data', 'rules')
// Centrifugo is a container of its own here, where production runs it inside the
// app's. The browser is told where it is rather than guessing.
const realtimePort = Number(process.env.PLAYWRIGHT_REALTIME_PORT ?? 8100)
const realtimeSecret = 'praetorium-e2e-realtime-secret'

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Both pages settle through Centrifugo rather than by polling, so assertions
  // need room for the nudge and the refetch behind it.
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: process.env.PLAYWRIGHT_TRACE ? 'on' : 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Tests run against the production server: the realtime connection, the
  // migrations and the session all behave differently under `vite dev`.
  webServer: [
    {
      command: `REALTIME_SECRET=${realtimeSecret} REALTIME_PORT=${realtimePort} REALTIME_CONTAINER=praetorium-e2e-realtime ./scripts/realtime.sh`,
      url: `http://127.0.0.1:${realtimePort}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `rm -rf ${root} && mkdir -p ${root} && DATA_DIR=${root} CATALOGUE_DIR=${catalogue} RULES_DIR=${rules} AUTH_RATE_LIMIT=off PORT=${port} REALTIME_SECRET=${realtimeSecret} REALTIME_API_URL=http://127.0.0.1:${realtimePort}/api REALTIME_URL=ws://127.0.0.1:${realtimePort}/connection/websocket node .output/server/index.mjs`,
      url: `${baseURL}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
