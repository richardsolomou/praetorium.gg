import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173)
const baseURL = `http://127.0.0.1:${port}`
// Under /tmp rather than os.tmpdir(): the container mounts this, and a macOS
// private temp directory is not shared with the Docker VM.
const root = process.env.PLAYWRIGHT_DATA_ROOT ?? `/tmp/praetorium-e2e-${port}`
// The synced catalogue, so list building is exercised against the real data.
const catalogue = process.env.CATALOGUE_DIR ?? path.join(import.meta.dirname, 'catalogue-data')
const image = process.env.PLAYWRIGHT_IMAGE ?? 'praetorium-e2e'
const container = `praetorium-e2e-${port}`

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results',
  // Spread the large builder spec across the worker pool. Tests create unique
  // accounts and rosters, so the shared database does not imply shared records.
  fullyParallel: true,
  // Every test shares one container and one SQLite file, so past a couple of
  // workers the runner buys contention rather than speed: four made sign-ups and
  // phase advances time out on tests that pass alone. Three keeps one more file
  // moving without returning to that failure mode.
  workers: 3,
  retries: 0,
  timeout: 45_000,
  // Both pages settle through Centrifugo rather than by polling, so assertions
  // need room for the nudge and the refetch behind it.
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: process.env.PLAYWRIGHT_TRACE ? 'on' : 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  /*
   * The container, not the bundle: Centrifugo and Caddy are part of how this app
   * serves a request, so a suite that ran the Node output alone would be testing a
   * topology nobody deploys — and the websocket would cross an origin it never
   * crosses in production.
   */
  webServer: {
    command: [
      `docker rm -f ${container} >/dev/null 2>&1 || true`,
      `rm -rf ${root} && mkdir -p ${root} && chmod 777 ${root}`,
      `docker run --rm --name ${container} -p 127.0.0.1:${port}:3000` +
        ` -v ${root}:/data -v ${catalogue}:/catalogue:ro` +
        ` -e CATALOGUE_DIR=/catalogue -e RULES_DIR=/catalogue/rules -e AUTH_RATE_LIMIT=off ${image}`,
    ].join(' && '),
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
