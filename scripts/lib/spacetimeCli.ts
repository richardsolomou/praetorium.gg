import os from 'node:os'
import path from 'node:path'
import packageJson from '../../node_modules/spacetimedb/package.json' with { type: 'json' }

/** The CLI release matches the pinned SDK so generated bindings and published modules agree. */
export const SPACETIME_VERSION = packageJson.version
export const installedSpacetimeCli = path.join(os.homedir(), '.local/share/spacetime/bin', SPACETIME_VERSION, 'spacetimedb-cli')
