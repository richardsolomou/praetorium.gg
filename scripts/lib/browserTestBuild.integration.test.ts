import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { browserTestBuildFingerprint, ensureBrowserTestBuild, restoreBrowserTestBuild, saveBrowserTestBuild } from './browserTestBuild'

const execute = promisify(execFile)
let directory: string

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'praetorium-browser-build-'))
  await execute('git', ['init', '--quiet', directory])
  await snapshot('first snapshot')
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

const fingerprint = (environment: NodeJS.ProcessEnv = {}) =>
  browserTestBuildFingerprint(directory, path.join(directory, 'snapshot'), environment)
async function file(name: string, content: string) {
  const target = path.join(directory, name)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content)
}

async function snapshot(manifest: string) {
  await file('snapshot/.snapshot-manifest.json', manifest)
  await file('snapshot/.snapshot.json', JSON.stringify({ id: createHash('sha256').update(manifest).digest('hex') }))
}

it.each([
  'src/example.ts',
  'scripts/example.ts',
  'public/reference-worker.js',
  'pnpm-lock.yaml',
  'ras.config.ts',
  'catalogue.json',
  'vite.config.ts',
  '.env.production.local',
])('invalidates the build after changing %s', async (name) => {
  await file(name, 'before')
  const before = await fingerprint()
  await file(name, 'after')
  expect(await fingerprint()).not.toBe(before)
})

it('invalidates the build after a tracked source is deleted', async () => {
  await file('src/example.ts', 'source')
  await execute('git', ['add', 'src/example.ts'], { cwd: directory })
  const before = await fingerprint()
  await rm(path.join(directory, 'src/example.ts'))
  expect(await fingerprint()).not.toBe(before)
})

it('invalidates the build after changing the verified catalogue snapshot', async () => {
  const before = await fingerprint()
  await snapshot('new snapshot')
  expect(await fingerprint()).not.toBe(before)
})

it('rejects a snapshot manifest that does not match its installed identity', async () => {
  await file('snapshot/.snapshot-manifest.json', 'changed without verification')
  await expect(fingerprint()).rejects.toThrow('verified catalogue snapshot manifest')
})

it('fingerprints public source catalogues and invalidates edits to their data', async () => {
  await rm(path.join(directory, 'snapshot'), { recursive: true })
  await file('snapshot/revision.json', '{"definitions":"pinned"}')
  await file('snapshot/definitions/faction.json', '{"name":"before"}')
  const before = await fingerprint()
  await file('snapshot/definitions/faction.json', '{"name":"after"}')
  expect(await fingerprint()).not.toBe(before)
})

it('rejects a published snapshot whose manifest is missing', async () => {
  await rm(path.join(directory, 'snapshot/.snapshot-manifest.json'))
  await expect(fingerprint()).rejects.toMatchObject({ code: 'ENOENT' })
})

it('invalidates the build after changing a client build environment value', async () => {
  expect(await fingerprint({ VITE_EXAMPLE: 'after' })).not.toBe(await fingerprint({ VITE_EXAMPLE: 'before' }))
})

it.each(['e2e/example.spec.ts', 'src/example.test.ts', 'scripts/example.integration.test.ts', 'docs/example.md'])(
  'reuses the build after changing only %s',
  async (name) => {
    const before = await fingerprint()
    await file(name, 'test-only edit')
    expect(await fingerprint()).toBe(before)
  },
)

it('does not include runtime ports or database credentials in the build identity', async () => {
  expect(await fingerprint({ APP_URL: 'http://127.0.0.1:3001', AUTH_SECRET: 'new-secret' })).toBe(
    await fingerprint({ APP_URL: 'http://127.0.0.1:3000', AUTH_SECRET: 'old-secret' }),
  )
})

it('keeps data-free production builds distinct from builds with bundled reference data', async () => {
  expect(await fingerprint({ CATALOGUE_RUNTIME_FETCH: 'true' })).not.toBe(await fingerprint({ CATALOGUE_RUNTIME_FETCH: 'false' }))
})

async function build() {
  for (const name of [
    'server/index.mjs',
    'server/seed-preview.mjs',
    'public/offline-app-version.json',
    'public/offline-reference-version.json',
  ])
    await file(`build/${name}`, 'compiled output')
  return path.join(directory, 'build')
}

it('restores compiled files into a fresh run without copying database state', async () => {
  const output = await build()
  await file('build/auth.sqlite', 'private run data')
  const cache = path.join(directory, 'cache')
  await saveBrowserTestBuild(cache, 'current', output)
  await restoreBrowserTestBuild(cache, 'current', path.join(directory, 'run'))
  expect(await readFile(path.join(directory, 'run/server/index.mjs'), 'utf8')).toBe('compiled output')
  await expect(readFile(path.join(directory, 'run/auth.sqlite'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('keeps traced dependencies resolvable after the build and cache directories are removed', async () => {
  const output = await build()
  await file('build/server/index.mjs', "export { default } from 'example'")
  await file('build/server/node_modules/.nf3/example/index.mjs', 'export default 42')
  await file('build/server/node_modules/.nf3/example/package.json', JSON.stringify({ type: 'module', main: 'index.mjs' }))
  await symlink('.nf3/example', path.join(output, 'server/node_modules/example'), 'dir')
  const cache = path.join(directory, 'cache')
  const restored = path.join(directory, 'run')
  await saveBrowserTestBuild(cache, 'current', output)
  await restoreBrowserTestBuild(cache, 'current', restored)
  await rm(output, { recursive: true })
  await rm(cache, { recursive: true })
  const { stdout } = await execute(process.execPath, [
    '--input-type=module',
    '-e',
    `console.log((await import(${JSON.stringify(pathToFileURL(path.join(restored, 'server/index.mjs')).href)})).default)`,
  ])
  expect(stdout.trim()).toBe('42')
})

it('rejects a build from different inputs', async () => {
  await saveBrowserTestBuild(path.join(directory, 'cache'), 'old', await build())
  expect(await restoreBrowserTestBuild(path.join(directory, 'cache'), 'current', path.join(directory, 'run'))).toBe(false)
})

it('restores a runtime-fetch build without requiring a bundled reference manifest', async () => {
  await build()
  await rm(path.join(directory, 'build/public/offline-reference-version.json'))
  await file('build/server/catalogue-refresh.mjs', 'worker')
  await file('build/server/catalogue-compiler.json', '{}')
  const cache = path.join(directory, 'cache')
  await saveBrowserTestBuild(cache, 'runtime', path.join(directory, 'build'))

  expect(await restoreBrowserTestBuild(cache, 'runtime', path.join(directory, 'run'), true)).toBe(true)
})

it('builds once and restores for the next stack', async () => {
  let builds = 0
  const output = path.join(directory, 'build')
  const cache = path.join(directory, 'cache')
  const snapshotDirectory = path.join(directory, 'snapshot')
  const compile = async () => {
    builds += 1
    await build()
  }
  const first = await ensureBrowserTestBuild(directory, snapshotDirectory, {}, output, cache, compile)
  await rm(output, { recursive: true, force: true })
  const second = await ensureBrowserTestBuild(directory, snapshotDirectory, {}, output, cache, compile)
  expect({ builds, first: first.cached, second: second.cached, same: first.fingerprint === second.fingerprint }).toEqual({
    builds: 1,
    first: false,
    second: true,
    same: true,
  })
})

it('builds normally when no compiled cache exists', async () => {
  expect(await restoreBrowserTestBuild(path.join(directory, 'absent'), 'current', path.join(directory, 'run'))).toBe(false)
})

it('discards an incomplete restored build', async () => {
  const cache = path.join(directory, 'cache')
  await saveBrowserTestBuild(cache, 'current', await build())
  await rm(path.join(cache, 'server/seed-preview.mjs'))
  expect(await restoreBrowserTestBuild(cache, 'current', path.join(directory, 'run'))).toBe(false)
})

it('replaces the previous cached build rather than retaining every source revision', async () => {
  const cache = path.join(directory, 'cache')
  const output = await build()
  await saveBrowserTestBuild(cache, 'old', output)
  await saveBrowserTestBuild(cache, 'new', output)
  expect(await restoreBrowserTestBuild(cache, 'old', path.join(directory, 'run'))).toBe(false)
})
