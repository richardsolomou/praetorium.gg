import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { baseURL, catalogue, internalPort, port, readyPort, root, spacetimePort } from './e2e/stackEnv'

delete process.env.NO_COLOR

export default defineConfig({
  testDir: './e2e',
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? path.join('test-results', path.basename(root)),
  // Each CI shard owns its local SQLite and SpacetimeDB data; scripts/e2eShard.ts assigns its tests.
  // Every test signs up its own players, so tests in one file can share a stack. Two workers is
  // what one stack sustains: at three, live-update tests start timing out locally.
  fullyParallel: true,
  workers: 2,
  // One CI retry turns a flake into a minute on one runner instead of a full rerun; the
  // github reporter still reports the test as flaky, and a local run never retries.
  retries: process.env.CI ? 1 : 0,
  /*
   * A journey test signs two players up, builds a list, sets a table and plays a turn.
   * None of that is asserting speed, and on a loaded CI runner the whole run can pass
   * 45 seconds without anything being wrong — the budget is only here so a genuinely
   * stuck test stops rather than hangs. `expect.timeout` below is the wait that means
   * something, and it stays where it was.
   */
  timeout: 120_000,
  // Live updates include a SpacetimeDB subscription and a refetch.
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: process.env.PLAYWRIGHT_TRACE ? 'on' : 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  // The runner starts Node with isolated local SQLite, object, and SpacetimeDB data.
  webServer: {
    command: 'pnpm exec tsx scripts/localDev.ts',
    env: {
      LOCAL_APP_PORT: String(port),
      LOCAL_INTERNAL_PORT: String(internalPort),
      LOCAL_SPACETIME_PORT: String(spacetimePort),
      LOCAL_READY_PORT: String(readyPort),
      LOCAL_PUBLIC_URL: baseURL,
      LOCAL_VITE_ORIGIN: '',
      LOCAL_DATA_DIR: root,
      LOCAL_TEST_MODE: 'true',
      NO_COLOR: '',
      EXPO_PUSH_ACCESS_TOKEN: 'unused-e2e-token',
      CATALOGUE_DIR: catalogue,
    },
    url: `http://127.0.0.1:${readyPort}/ready`,
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
    // The first run builds and seeds the local web and product databases.
    timeout: 240_000,
  },
})
