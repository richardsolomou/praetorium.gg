import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { system } from '../../src/server/catalogue.fixtures'
import { readCatalogueRuntime } from '../../src/server/catalogueRuntime'
import { writeCanonicalCatalogue } from '../../src/server/canonicalCatalogue'
import { writeCatalogueRuntime } from './catalogueRuntime'
import {
  downloadRuntime,
  installRuntimeArchive,
  packCatalogueRuntime,
  runtimeStoreUrl,
  uploadRuntime,
  storeHasRuntime,
} from './catalogueRuntimeDistribution'

let root: string
let source: string
let prepared: string
let archive: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'catalogue-runtime-store-'))
  source = path.join(root, 'source')
  prepared = path.join(root, 'prepared')
  archive = path.join(root, 'runtime.zip')
  fs.mkdirSync(path.join(source, 'definitions'), { recursive: true })
  fs.writeFileSync(path.join(source, 'definitions/system.json'), JSON.stringify(system))
  fs.writeFileSync(path.join(source, 'revision.json'), JSON.stringify({ definitions: 'authored' }))
  writeCatalogueRuntime(source, prepared)
  packCatalogueRuntime(source, prepared, archive)
})
afterEach(() => {
  vi.unstubAllGlobals()
  fs.rmSync(root, { recursive: true, force: true })
})

const startupHash = (directory: string) =>
  createHash('sha256')
    .update(fs.readFileSync(path.join(directory, 'startup.json')))
    .digest('hex')

it('does not overwrite shared snapshot disk blocks when compiling a new canonical file', () => {
  const file = path.join(source, 'canonical.json')
  const retained = path.join(root, 'retained.json')
  fs.writeFileSync(file, 'previous verified contents')
  fs.linkSync(file, retained)
  writeCanonicalCatalogue(source, file)
  expect(fs.readFileSync(retained, 'utf8')).toBe('previous verified contents')
})

it('restores exactly the prepared projections from a shared archive', async () => {
  vi.stubGlobal('fetch', async () => new Response(fs.readFileSync(archive)))
  const installed = path.join(root, 'installed')
  expect(await downloadRuntime(source, installed, 'key', 'https://store.test/by-key')).toBe(true)
  expect(readCatalogueRuntime(source, installed).read('startup')).toEqual(readCatalogueRuntime(source, prepared).read('startup'))
})

it('asks the store for the archive named by the key', async () => {
  const requests: string[] = []
  vi.stubGlobal('fetch', async (input: string) => {
    requests.push(input)
    return new Response('', { status: 404 })
  })
  expect(await downloadRuntime(source, path.join(root, 'installed'), 'abc-def', 'https://store.test/by-key')).toBe(false)
  expect(requests).toEqual(['https://store.test/by-key/abc-def.zip'])
})

it('rejects an archive prepared for another snapshot', async () => {
  vi.stubGlobal('fetch', async () => new Response(fs.readFileSync(archive)))
  fs.writeFileSync(path.join(source, 'revision.json'), JSON.stringify({ definitions: 'changed' }))
  expect(await downloadRuntime(source, path.join(root, 'installed'), 'key', 'https://store.test/by-key')).toBe(false)
})

it('retains the previous runtime when an archive is corrupt', async () => {
  const bytes = fs.readFileSync(archive)
  const middle = Math.floor(bytes.length / 2)
  bytes[middle] = bytes[middle]! ^ 1
  vi.stubGlobal('fetch', async () => new Response(bytes))
  const before = startupHash(prepared)
  expect({ restored: await downloadRuntime(source, prepared, 'key', 'https://store.test/by-key'), startup: startupHash(prepared) }).toEqual(
    {
      restored: false,
      startup: before,
    },
  )
})

it('does not fetch when the store is off', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  expect({
    store: runtimeStoreUrl({ CATALOGUE_RUNTIME_STORE: 'off' }),
    restored: await downloadRuntime(source, prepared, 'key', null),
  }).toEqual({
    store: null,
    restored: false,
  })
  expect(fetch).not.toHaveBeenCalled()
})

it('reports a key the store answers for, and treats an unreachable store as holding it', async () => {
  vi.stubGlobal('fetch', async (_input: string, init?: RequestInit) => new Response('', { status: init?.method === 'HEAD' ? 404 : 200 }))
  const missing = await storeHasRuntime('key', 'https://store.test/by-key')
  vi.stubGlobal('fetch', async () => new Response('', { status: 200 }))
  const present = await storeHasRuntime('key', 'https://store.test/by-key')
  vi.stubGlobal('fetch', async () => {
    throw new Error('offline')
  })
  const unreachable = await storeHasRuntime('key', 'https://store.test/by-key')
  expect({ missing, present, unreachable, off: await storeHasRuntime('key', null) }).toEqual({
    missing: false,
    present: true,
    unreachable: true,
    off: true,
  })
})

it('shares the catalogue mirror by default', () => {
  expect(runtimeStoreUrl({})).toBe('https://s3.praetorium.gg/catalogue/runtime/by-key')
})

it('writes an archive once and leaves an existing key alone', async () => {
  const puts: { url: string; ifNoneMatch: string | undefined }[] = []
  const uploader = {
    base: 'https://account.r2.cloudflarestorage.com/praetorium/',
    fetch: async (url: string, init: RequestInit) => {
      puts.push({ url, ifNoneMatch: new Headers(init.headers).get('if-none-match') ?? undefined })
      return new Response('', { status: puts.length === 1 ? 200 : 412 })
    },
  }
  const bytes = fs.readFileSync(archive)
  expect({ first: await uploadRuntime('key', bytes, uploader), second: await uploadRuntime('key', bytes, uploader), puts }).toEqual({
    first: 'uploaded',
    second: 'exists',
    puts: Array.from({ length: 2 }, () => ({
      url: 'https://account.r2.cloudflarestorage.com/praetorium/catalogue/runtime/by-key/key.zip',
      ifNoneMatch: '*',
    })),
  })
})

it('skips sharing without write access', async () => {
  expect(await uploadRuntime('key', fs.readFileSync(archive), null)).toBe('skipped')
})

it('installs an archive atomically over a previous runtime', () => {
  const output = path.join(root, 'output')
  writeCatalogueRuntime(source, output)
  installRuntimeArchive(source, output, fs.readFileSync(archive))
  expect({ startup: startupHash(output), leftovers: fs.readdirSync(root).filter((name) => name.startsWith('output.')) }).toEqual({
    startup: startupHash(prepared),
    leftovers: [],
  })
})
