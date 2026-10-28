import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fetchLiveCatalogue, publishLiveCatalogue } from './liveCatalogueArchive'

let root: string
let catalogue: string
let stored: { body: Uint8Array; headers: Record<string, string>; etag: string } | null
const store = {
  base: 'https://store.test/praetorium-private/',
  client: {
    fetch: vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      if (init?.method === 'PUT') {
        const condition = headers.get('if-match') ?? (headers.get('if-none-match') === '*' ? null : undefined)
        if (condition !== undefined && condition !== (stored?.etag ?? null)) return new Response(null, { status: 412 })
        stored = {
          body: new Uint8Array(init.body as Buffer),
          headers: Object.fromEntries([...headers].filter(([name]) => name.startsWith('x-amz-meta-'))),
          etag: `"${Math.random()}"`,
        }
        return new Response(null, { status: 200 })
      }
      if (!stored) return new Response(null, { status: 404 })
      const response = { headers: { ...stored.headers, etag: stored.etag } }
      return init?.method === 'HEAD' ? new Response(null, response) : new Response(new Uint8Array(stored.body), response)
    }),
  },
}
const version = (sources: string) => ({ authoring: 'a'.repeat(64), sources })
const puts = () => store.client.fetch.mock.calls.filter(([, init]) => init?.method === 'PUT').length

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-live-catalogue-'))
  catalogue = path.join(root, 'catalogue')
  stored = null
  fs.mkdirSync(path.join(catalogue, 'definitions'), { recursive: true })
  fs.writeFileSync(path.join(catalogue, 'revision.json'), '{"definitions":"live"}')
  fs.writeFileSync(path.join(catalogue, 'definitions/system.json'), '{"id":"system"}')
  vi.clearAllMocks()
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

it('round-trips the live catalogue through the private bucket', async () => {
  await publishLiveCatalogue(catalogue, 'production', version('first'), null, store)
  const restored = path.join(root, 'restored')
  await fetchLiveCatalogue('production', restored, 'a'.repeat(64), store)
  expect(fs.readFileSync(path.join(restored, 'definitions/system.json'), 'utf8')).toBe('{"id":"system"}')
})

it('does not unpack a catalogue materialized with another configuration', async () => {
  await publishLiveCatalogue(catalogue, 'production', version('first'), null, store)
  const restored = path.join(root, 'restored')
  await fetchLiveCatalogue('production', restored, 'b'.repeat(64), store)
  expect(fs.existsSync(restored)).toBe(false)
})

it('publishes unchanged sources once', async () => {
  const results = [
    await publishLiveCatalogue(catalogue, 'production', version('first'), null, store),
    await publishLiveCatalogue(catalogue, 'production', version('first'), null, store),
  ]
  expect({ results, uploads: puts() }).toEqual({ results: ['published', 'unchanged'], uploads: 1 })
})

it('publishes sources refreshed from the published ones', async () => {
  await publishLiveCatalogue(catalogue, 'production', version('first'), null, store)
  expect(await publishLiveCatalogue(catalogue, 'production', version('second'), version('first'), store)).toBe('published')
})

it('leaves sources another refresh published in place', async () => {
  await publishLiveCatalogue(catalogue, 'production', version('first'), null, store)
  await publishLiveCatalogue(catalogue, 'production', version('newer'), version('first'), store)
  expect(await publishLiveCatalogue(catalogue, 'production', version('older'), version('first'), store)).toBe('superseded')
})

it('leaves the archive alone when another refresh publishes during the upload', async () => {
  await publishLiveCatalogue(catalogue, 'production', version('first'), null, store)
  const head = store.client.fetch.getMockImplementation()!
  store.client.fetch.mockImplementationOnce(async (url, init) => {
    const response = await head(url, init)
    stored = { ...stored!, etag: '"concurrent"' }
    return response
  })
  expect(await publishLiveCatalogue(catalogue, 'production', version('second'), version('first'), store)).toBe('superseded')
})

it('reports a target that has published nothing', async () => {
  expect(await fetchLiveCatalogue('production', path.join(root, 'restored'), 'a'.repeat(64), store)).toBe(null)
})

it('refuses an unknown target', async () => {
  await expect(fetchLiveCatalogue('preview', path.join(root, 'restored'), 'a'.repeat(64), store)).rejects.toThrow(
    'Unknown live catalogue target',
  )
})
