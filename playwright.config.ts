import { defineConfig, devices } from '@playwright/test'
import { baseURL, catalogue, image, port, root } from './e2e/stackEnv'

export default defineConfig({
  testDir: './e2e',
  // Playwright is still alive here, unlike the shell that started the stack.
  globalTeardown: './e2e/globalTeardown.ts',
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? 'test-results',
  fullyParallel: false,
  // One worker owns each container and database; CI starts isolated processes for parallelism.
  workers: 1,
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
