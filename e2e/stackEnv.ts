import path from 'node:path'
import { localTestEnvironment } from '../scripts/lib/localStack'
import { catalogueDataDirectory } from '../scripts/lib/catalogueFiles'

if (!process.env.PLAYWRIGHT_READY_PORT) Object.assign(process.env, await localTestEnvironment('e2e'))

export const port = Number(process.env.PLAYWRIGHT_PORT)
export const baseURL = `http://127.0.0.1:${port}`
export const internalPort = Number(process.env.PLAYWRIGHT_INTERNAL_PORT)
export const spacetimePort = Number(process.env.PLAYWRIGHT_SPACETIME_PORT)
export const readyPort = Number(process.env.PLAYWRIGHT_READY_PORT)
/** The app server's inspector, open only in a coverage run. */
export const inspectPort = process.env.PLAYWRIGHT_INSPECT_PORT ? Number(process.env.PLAYWRIGHT_INSPECT_PORT) : null
export const root = process.env.PLAYWRIGHT_DATA_ROOT!
/**
 * Where a coverage run's stack records what runs outside the browser and the app server's
 * per-test coverage: `seed/` for the preview seed, `server/` for the app server's threads,
 * `startup/` for its startup, and `spacetime/` for the SpacetimeDB module's calls.
 */
export const processCoverage = process.env.E2E_COVERAGE_DIR
  ? path.join(process.env.E2E_COVERAGE_DIR, 'processes', path.basename(root))
  : null
export const catalogue = catalogueDataDirectory()
