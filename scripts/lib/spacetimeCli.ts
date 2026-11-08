import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import packageJson from '../../package.json' with { type: 'json' }

/** The CLI release matches the pinned SDK so generated bindings and published modules agree. */
export const SPACETIME_VERSION = packageJson.dependencies.spacetimedb
export const installedSpacetimeCli = path.join(os.homedir(), '.local/share/spacetime/bin', SPACETIME_VERSION, 'spacetimedb-cli')
export const spacetimeCli = process.env.SPACETIME_BIN ?? (existsSync(installedSpacetimeCli) ? installedSpacetimeCli : 'spacetime')

export async function assertSpacetimeCliVersion(signal?: AbortSignal) {
  const { stdout } = await promisify(execFile)(spacetimeCli, ['--version'], { signal })
  if (!stdout.includes(`spacetimedb tool version ${SPACETIME_VERSION};`))
    throw new Error(`SpacetimeDB CLI ${SPACETIME_VERSION} is required`)
}
