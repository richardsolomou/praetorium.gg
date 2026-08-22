import { defineConfig, devices } from '@playwright/test'
import { baseURL, catalogue, image, port, root } from './e2e/stackEnv'

export default defineConfig({
  testDir: './e2e',
  // Playwright is still alive here, unlike the shell that started the stack.
  globalTeardown: './e2e/globalTeardown.ts',
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? 'test-results',
  // Sharding reads this setting before it assigns tests. Keeping it only on the
  // command line leaves the large builder spec on one runner while others are empty.
  fullyParallel: true,
  // One worker owns each container and database; CI starts isolated processes for parallelism.
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
  // Both pages settle through Centrifugo rather than by polling, so assertions
  // need room for the nudge and the refetch behind it.
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: process.env.PLAYWRIGHT_TRACE ? 'on' : 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  /*
   * The container, not the bundle: Centrifugo and Caddy are part of how this app
   * serves a request, so a suite that ran the Node output alone would be testing a
   * topology nobody deploys — and the websocket would cross an origin it never
   * crosses in production.
   *
   * Postgres and Valkey come up beside it for the same reason. The script owns
   * the whole stack so it can take all of it down again, including after a
   * failure.
   */
  webServer: {
    command: `sh e2e/stack.sh ${port}`,
    env: {
      PLAYWRIGHT_IMAGE: image,
      PLAYWRIGHT_DATA_ROOT: root,
      CATALOGUE_HOST_DIR: catalogue,
    },
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    // Longer than before: Postgres has to accept connections and the schema has
    // to be applied before the app answers its first health check.
    timeout: 240_000,
  },
})
