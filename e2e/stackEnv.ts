import path from 'node:path'
import { localTestEnvironment } from '../scripts/lib/localStack'

if (!process.env.PLAYWRIGHT_READY_PORT) Object.assign(process.env, await localTestEnvironment('e2e'))

export const port = Number(process.env.PLAYWRIGHT_PORT)
export const baseURL = `http://127.0.0.1:${port}`
export const internalPort = Number(process.env.PLAYWRIGHT_INTERNAL_PORT)
export const spacetimePort = Number(process.env.PLAYWRIGHT_SPACETIME_PORT)
export const readyPort = Number(process.env.PLAYWRIGHT_READY_PORT)
export const root = process.env.PLAYWRIGHT_DATA_ROOT!
export const catalogue = process.env.CATALOGUE_DIR ?? path.join(import.meta.dirname, '..', 'catalogue-data')
