import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SPACETIME_VERSION } from './lib/spacetimeCli'

const root = path.join(import.meta.dirname, '..')
const versionsIn = (file: string, pattern: RegExp) =>
  [...readFileSync(path.join(root, file), 'utf8').matchAll(pattern)].map((match) => match[1])

describe('SpacetimeDB version pins', () => {
  it.each([
    ['.github/actions/setup-spacetime/action.yml', /version: '([^']+)'/g],
    ['Dockerfile.node', /SpacetimeDB\/releases\/download\/v([^/]+)\//g],
    ['scripts/verifySpacetimeBackup.sh', /clockworklabs\/spacetime:v(\S+)/g],
    ['CONTRIBUTING.md', /SpacetimeDB CLI ([^,\s]+)/g],
    ['spacetimedb/package.json', /"spacetimedb": "([^"]+)"/g],
  ])('%s matches the SDK', (file, pattern) => {
    expect(new Set(versionsIn(file, pattern))).toEqual(new Set([SPACETIME_VERSION]))
  })

  it('pnpm-workspace.yaml approves only the SDK version early', () => {
    expect(versionsIn('pnpm-workspace.yaml', /\bspacetimedb@(\S+)/g).filter((version) => version !== SPACETIME_VERSION)).toEqual([])
  })
})
