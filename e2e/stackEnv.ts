import path from 'node:path'

/**
 * What the browser suite and its stack agree on.
 *
 * Shared so the Playwright config, the teardown and the shell script cannot
 * disagree about which port a run owns, and therefore which containers are its
 * own to remove.
 */
export const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173)
export const baseURL = `http://127.0.0.1:${port}`
// Under /tmp rather than os.tmpdir(): the container mounts this, and a macOS
// private temp directory is not shared with the Docker VM.
export const root = process.env.PLAYWRIGHT_DATA_ROOT ?? `/tmp/praetorium-e2e-${port}`
// The synced catalogue, so list building is exercised against the real data.
export const catalogue = process.env.CATALOGUE_DIR ?? path.join(import.meta.dirname, '..', 'catalogue-data')
export const image = process.env.PLAYWRIGHT_IMAGE ?? 'praetorium-e2e'
