import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { system } from '../../src/server/catalogue.fixtures'
import { readCatalogueRuntime } from '../../src/server/catalogueRuntime'
import { writeCatalogueRuntime } from './catalogueRuntime'
import { installPublishedRuntime, packCatalogueRuntime } from './catalogueRuntimeDistribution'
import type { SnapshotPointer } from '../../src/server/catalogueSnapshot'
import { writeCanonicalCatalogue } from '../../src/server/canonicalCatalogue'

let root: string
let source: string
let prepared: string
let archive: string
let pointer: SnapshotPointer
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'catalogue-runtime-mirror-'))
  source = path.join(root, 'source')
  prepared = path.join(root, 'prepared')
  archive = path.join(root, 'runtime.zip')
  fs.mkdirSync(path.join(source, 'definitions'), { recursive: true })
  fs.writeFileSync(path.join(source, 'definitions/system.json'), JSON.stringify(system))
  fs.writeFileSync(path.join(source, 'revision.json'), JSON.stringify({ definitions: 'authored' }))
  writeCatalogueRuntime(source, prepared)
  pointer = {
    format: 'praetorium.catalogue-pointer.v1',
    id: 'a'.repeat(64),
    archiveSha256: 'b'.repeat(64),
    runtime: packCatalogueRuntime(source, prepared, archive),
  }
})
afterEach(() => {
  vi.unstubAllGlobals()
  fs.rmSync(root, { recursive: true, force: true })
})

it('does not overwrite shared snapshot disk blocks when compiling a new canonical file', () => {
  const file = path.join(source, 'canonical.json')
  const retained = path.join(root, 'retained.json')
  fs.writeFileSync(file, 'previous verified contents')
  fs.linkSync(file, retained)
  writeCanonicalCatalogue(source, file)
  expect(fs.readFileSync(retained, 'utf8')).toBe('previous verified contents')
})

it('restores exactly the prepared projections from a published runtime', async () => {
  vi.stubGlobal('fetch', async () => new Response(fs.readFileSync(archive)))
  const destination = path.join(root, 'installed')
  await installPublishedRuntime(source, destination, pointer)
  expect(readCatalogueRuntime(source, destination).read('startup')).toEqual(readCatalogueRuntime(source, prepared).read('startup'))
})

it('uses GitHub when the runtime artifact is missing on R2', async () => {
  const requests: string[] = []
  vi.stubGlobal('fetch', async (input: string) => {
    requests.push(input)
    return input.startsWith('https://github.com/') ? new Response(fs.readFileSync(archive)) : new Response('', { status: 404 })
  })
  await installPublishedRuntime(source, path.join(root, 'installed'), pointer)
  expect(requests.at(-1)).toBe(
    `https://github.com/richardsolomou/praetorium-catalogue/releases/download/catalogue-${pointer.id}/runtime.zip`,
  )
})

it('requires a fresh compilation after the source fingerprint changes', async () => {
  fs.writeFileSync(path.join(source, 'revision.json'), JSON.stringify({ definitions: 'changed' }))
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  expect(await installPublishedRuntime(source, path.join(root, 'installed'), pointer)).toBe(false)
  expect(fetch).not.toHaveBeenCalled()
})

it('retains the previous runtime when an archive checksum fails', async () => {
  const bytes = fs.readFileSync(archive)
  bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1
  vi.stubGlobal('fetch', async () => new Response(bytes))
  const before = createHash('sha256')
    .update(fs.readFileSync(path.join(prepared, 'startup.json')))
    .digest('hex')
  await expect(installPublishedRuntime(source, prepared, pointer)).rejects.toThrow('checksum')
  expect(
    createHash('sha256')
      .update(fs.readFileSync(path.join(prepared, 'startup.json')))
      .digest('hex'),
  ).toBe(before)
})
