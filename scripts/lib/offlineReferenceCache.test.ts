import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { zipSync } from 'fflate'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { prepareReferenceBundle, referenceBundleKey, type ReferenceStore } from './offlineReferenceCache'

const bundle = `/assets/reference-${'a'.repeat(64)}.bin`
const current = `/assets/construction-${'b'.repeat(64)}.bin`
const complete = `/assets/construction-${'c'.repeat(64)}.bin`
const manifest = JSON.stringify({
  revision: 'a'.repeat(64),
  reference: { core: bundle, search: bundle, parts: {} },
  construction: { catalogue: current, rules: complete, editions: {} },
})

let root: string
let directory: string
let cacheRoot: string
let outDir: string
const build = vi.fn(async (target: string) => {
  fs.writeFileSync(path.join(target, 'offline-reference-version.json'), manifest)
  for (const file of [bundle, current, complete]) fs.writeFileSync(path.join(target, file), file)
})
const empty = (): ReferenceStore => ({ has: async () => true, download: async () => null, upload: vi.fn(async () => 'skipped') })
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-offline-reference-cache-'))
  directory = path.join(root, 'catalogue')
  cacheRoot = path.join(root, 'cache')
  outDir = path.join(root, 'out')
  fs.mkdirSync(path.join(directory, 'changes'), { recursive: true })
  vi.clearAllMocks()
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

const written = () =>
  Object.fromEntries([bundle, current, complete].map((file) => [file, fs.readFileSync(path.join(outDir, file), 'utf8')]))
const archiveOf = (files: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([name, content]) => [name, new TextEncoder().encode(content)])))

it('builds the reference once and restores it for the next build', async () => {
  const results = [
    await prepareReferenceBundle(outDir, 'key', directory, cacheRoot, build, empty()),
    await prepareReferenceBundle(path.join(root, 'second'), 'key', directory, cacheRoot, build, empty()),
  ]
  expect({ results, builds: build.mock.calls.length }).toEqual({ results: ['built', 'cached'], builds: 1 })
})

it('writes the manifest and every asset it names', async () => {
  await prepareReferenceBundle(outDir, 'key', directory, cacheRoot, build, empty())
  expect({ manifest: fs.readFileSync(path.join(outDir, 'offline-reference-version.json'), 'utf8'), assets: written() }).toEqual({
    manifest,
    assets: { [bundle]: bundle, [current]: current, [complete]: complete },
  })
})

it('shares a built reference under its key', async () => {
  const store = empty()
  await prepareReferenceBundle(outDir, 'key', directory, null, build, store)
  expect(vi.mocked(store.upload).mock.calls[0]?.[0]).toBe('key')
})

it('restores a shared reference without building', async () => {
  const shared = archiveOf({
    'offline-reference-version.json': manifest,
    [bundle.slice(1)]: 'b',
    [current.slice(1)]: 'c',
    [complete.slice(1)]: 'd',
  })
  const result = await prepareReferenceBundle(outDir, 'key', directory, null, build, { ...empty(), download: async () => shared })
  expect({ result, builds: build.mock.calls.length, assets: written() }).toEqual({
    result: 'downloaded',
    builds: 0,
    assets: { [bundle]: 'b', [current]: 'c', [complete]: 'd' },
  })
})

it('builds instead of restoring an archive with files its manifest does not name', async () => {
  const shared = archiveOf({
    'offline-reference-version.json': manifest,
    [bundle.slice(1)]: 'b',
    [current.slice(1)]: 'c',
    [complete.slice(1)]: 'd',
    '../escape.js': 'x',
  })
  expect(await prepareReferenceBundle(outDir, 'key', directory, null, build, { ...empty(), download: async () => shared })).toBe('built')
})

it('keys the reference by the snapshot change history', () => {
  fs.writeFileSync(path.join(directory, 'changes/history.json'), '[]')
  const before = referenceBundleKey(directory, 'runtime')
  fs.writeFileSync(path.join(directory, 'changes/history.json'), '[{}]')
  expect(referenceBundleKey(directory, 'runtime')).not.toBe(before)
})
