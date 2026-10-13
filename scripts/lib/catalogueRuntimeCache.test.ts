import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { system } from '../../src/server/catalogue.fixtures'
import { readCatalogueRuntime } from '../../src/server/catalogueRuntime'
import { writeCatalogueRuntime } from './catalogueRuntime'
import { prepareCatalogueRuntime, runtimeCacheKey, type RuntimeStore } from './catalogueRuntimeCache'
import { installRuntimeArchive } from './catalogueRuntimeDistribution'

let directory: string
let cacheRoot: string
let output: string
const compile = vi.fn((source: string, target: string) => writeCatalogueRuntime(source, target))
const offline: RuntimeStore = { download: vi.fn(async () => false), upload: vi.fn(async () => 'skipped') }
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-runtime-cache-'))
  cacheRoot = path.join(directory, 'cache')
  output = path.join(directory, 'output', 'catalogue-runtime')
  fs.mkdirSync(path.join(directory, 'definitions'))
  fs.writeFileSync(path.join(directory, 'definitions', 'system.json'), JSON.stringify(system))
  fs.writeFileSync(path.join(directory, 'revision.json'), JSON.stringify({ definitions: 'authored-test' }))
  vi.clearAllMocks()
})
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }))

const key = () => runtimeCacheKey(directory, 'sources')

it('compiles the runtime once and restores it for the next build', async () => {
  const first = await prepareCatalogueRuntime(directory, output, cacheRoot, compile, key(), offline)
  fs.rmSync(output, { recursive: true })
  const second = await prepareCatalogueRuntime(directory, output, cacheRoot, compile, key(), offline)
  expect({ first, second, compiled: compile.mock.calls.length, restored: fs.existsSync(path.join(output, 'startup.json')) }).toEqual({
    first: 'compiled',
    second: 'cached',
    compiled: 1,
    restored: true,
  })
})

it('compiles again after the snapshot changes', async () => {
  await prepareCatalogueRuntime(directory, output, cacheRoot, compile, key(), offline)
  fs.writeFileSync(path.join(directory, 'revision.json'), JSON.stringify({ definitions: 'changed' }))
  const result = await prepareCatalogueRuntime(directory, output, cacheRoot, compile, key(), offline)
  expect({ result, compiled: compile.mock.calls.length }).toEqual({ result: 'compiled', compiled: 2 })
})

it('compiles again after a compiler source changes', async () => {
  await prepareCatalogueRuntime(directory, output, cacheRoot, compile, runtimeCacheKey(directory, 'before'), offline)
  const result = await prepareCatalogueRuntime(directory, output, cacheRoot, compile, runtimeCacheKey(directory, 'after'), offline)
  expect({ result, compiled: compile.mock.calls.length }).toEqual({ result: 'compiled', compiled: 2 })
})

it('discards a cached runtime that fails verification', async () => {
  await prepareCatalogueRuntime(directory, output, cacheRoot, compile, key(), offline)
  const [entry] = fs.readdirSync(cacheRoot)
  fs.appendFileSync(path.join(cacheRoot, entry!, 'startup.json'), ' ')
  const result = await prepareCatalogueRuntime(directory, output, cacheRoot, compile, key(), offline)
  expect({ result, compiled: compile.mock.calls.length, entries: fs.readdirSync(cacheRoot) }).toEqual({
    result: 'compiled',
    compiled: 2,
    entries: [entry],
  })
})

it('shares a fresh compile under its key as an archive that installs identically', async () => {
  const uploads: { key: string; archive: Uint8Array }[] = []
  const store: RuntimeStore = {
    download: async () => false,
    upload: async (shared, archive) => void uploads.push({ key: shared, archive }),
  }
  await prepareCatalogueRuntime(directory, output, null, compile, key(), store)
  const installed = path.join(directory, 'installed')
  installRuntimeArchive(directory, installed, uploads[0]!.archive)
  expect({ keys: uploads.map((upload) => upload.key), startup: readCatalogueRuntime(directory, installed).read('startup') }).toEqual({
    keys: [key()],
    startup: readCatalogueRuntime(directory, output).read('startup'),
  })
})

it('restores a shared runtime instead of compiling, and caches it', async () => {
  const store: RuntimeStore = {
    download: async (source, target) => {
      writeCatalogueRuntime(source, target)
      return true
    },
    upload: vi.fn(async () => 'uploaded'),
  }
  const first = await prepareCatalogueRuntime(directory, output, cacheRoot, compile, key(), store)
  fs.rmSync(output, { recursive: true })
  const second = await prepareCatalogueRuntime(directory, output, cacheRoot, compile, key(), offline)
  expect({
    first,
    second,
    compiled: compile.mock.calls.length,
    uploaded: (store.upload as ReturnType<typeof vi.fn>).mock.calls.length,
  }).toEqual({
    first: 'downloaded',
    second: 'cached',
    compiled: 0,
    uploaded: 0,
  })
})

it('keeps the compiled runtime when sharing it fails', async () => {
  const store: RuntimeStore = {
    download: async () => false,
    upload: async () => {
      throw new Error('store is read-only')
    },
  }
  const result = await prepareCatalogueRuntime(directory, output, cacheRoot, compile, key(), store)
  expect({ result, startup: fs.existsSync(path.join(output, 'startup.json')) }).toEqual({ result: 'compiled', startup: true })
})

it('compiles without storing when the cache is off', async () => {
  const result = await prepareCatalogueRuntime(directory, output, null, compile, key(), offline)
  expect({ result, cache: fs.existsSync(cacheRoot) }).toEqual({ result: 'compiled', cache: false })
})
