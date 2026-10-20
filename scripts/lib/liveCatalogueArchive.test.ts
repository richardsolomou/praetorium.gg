import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fetchLiveCatalogue, publishLiveCatalogue } from './liveCatalogueArchive'

let root: string
let catalogue: string
let marker: string
let stored: Uint8Array | null
const store = {
  base: 'https://store.test/praetorium-private/',
  client: {
    fetch: vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        stored = new Uint8Array(init.body as Buffer)
        return new Response(null, { status: 200 })
      }
      return stored ? new Response(new Uint8Array(stored)) : new Response(null, { status: 404 })
    }),
  },
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-live-catalogue-'))
  catalogue = path.join(root, 'catalogue')
  marker = path.join(root, 'live-archive')
  stored = null
  fs.mkdirSync(path.join(catalogue, 'definitions'), { recursive: true })
  fs.writeFileSync(path.join(catalogue, 'revision.json'), '{"definitions":"live"}')
  fs.writeFileSync(path.join(catalogue, 'definitions/system.json'), '{"id":"system"}')
  vi.clearAllMocks()
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

it('round-trips the live catalogue through the private bucket', async () => {
  await publishLiveCatalogue(catalogue, 'production', marker, store)
  const restored = path.join(root, 'restored')
  await fetchLiveCatalogue('production', restored, store)
  expect(fs.readFileSync(path.join(restored, 'definitions/system.json'), 'utf8')).toBe('{"id":"system"}')
})

it('publishes an unchanged catalogue once', async () => {
  const results = [
    await publishLiveCatalogue(catalogue, 'production', marker, store),
    await publishLiveCatalogue(catalogue, 'production', marker, store),
  ]
  expect({ results, uploads: store.client.fetch.mock.calls.length }).toEqual({ results: ['published', 'unchanged'], uploads: 1 })
})

it('publishes again after the catalogue revision changes', async () => {
  await publishLiveCatalogue(catalogue, 'production', marker, store)
  fs.writeFileSync(path.join(catalogue, 'revision.json'), '{"definitions":"newer"}')
  expect(await publishLiveCatalogue(catalogue, 'production', marker, store)).toBe('published')
})

it('reports a target that has published nothing', async () => {
  expect(await fetchLiveCatalogue('production', path.join(root, 'restored'), store)).toBe(false)
})

it('refuses an unknown target', async () => {
  await expect(fetchLiveCatalogue('preview', path.join(root, 'restored'), store)).rejects.toThrow('Unknown live catalogue target')
})
