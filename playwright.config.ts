import { defineConfig, devices } from '@playwright/test'
import { baseURL, catalogue, port, root } from './e2e/stackEnv'

export default defineConfig({
  testDir: './e2e',
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? 'test-results',
  // Each CI shard owns its local SQLite and SpacetimeDB data; scripts/e2eShard.ts assigns its tests.
  workers: 1,
  retries: 0,
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
      LOCAL_DATA_DIR: root,
      LOCAL_TEST_MODE: 'true',
      CATALOGUE_HOST_DIR: catalogue,
    },
    url: `http://127.0.0.1:${port + 20_000}/ready`,
    reuseExistingServer: false,
    // The first run builds and seeds the local web and product databases.
    timeout: 240_000,
  },
})
