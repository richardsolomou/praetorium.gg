import path from 'node:path'

/** Shared ports and data directory for Playwright and its local Worker runner. */
export const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173)
export const baseURL = `http://127.0.0.1:${port}`
export const spacetimePort = port + 10_000
export const root = process.env.PLAYWRIGHT_DATA_ROOT ?? `/tmp/praetorium-e2e-${port}`
// The synced catalogue, so list building is exercised against the real data.
export const catalogue = process.env.CATALOGUE_DIR ?? path.join(import.meta.dirname, '..', 'catalogue-data')
