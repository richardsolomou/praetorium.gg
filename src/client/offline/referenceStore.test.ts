import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readPart, saveReference, storesEvery } from './referenceStore'
import { encodeReferencePart, type OfflineReferenceData } from '../../contracts/offlineReference'

const origin = 'https://praetorium.gg'
let stored: Map<string, Response>
const deleted: string[] = []

beforeEach(() => {
  stored = new Map()
  deleted.length = 0
  const store = {
    match: async (request: string) => stored.get(new URL(request, origin).href)?.clone(),
    delete: async (request: Request | string) => stored.delete(new URL(typeof request === 'string' ? request : request.url, origin).href),
    put: async (request: string, response: Response) => void stored.set(new URL(request, origin).href, response),
    keys: async () => [...stored.keys()].map((url) => new Request(url)),
  }
  vi.stubGlobal('location', { href: `${origin}/battles/game` })
  vi.stubGlobal('caches', { open: async () => store, delete: async (name: string) => void deleted.push(name) })
})
afterEach(() => vi.unstubAllGlobals())

const part = (value: unknown) => new Response(gzipSync(encodeReferencePart(value)))

it('decodes a stored part without reaching the service', async () => {
  stored.set(`${origin}/assets/reference-a.bin`, part([{ key: ['rule-index'], data: 'Rules' }]))
  vi.stubGlobal('fetch', vi.fn())
  expect(await readPart('/assets/reference-a.bin', 1_000, true)).toEqual([{ key: ['rule-index'], data: 'Rules' }])
})

it('refuses to decode a part beyond its size limit', async () => {
  stored.set(`${origin}/assets/reference-a.bin`, part('x'.repeat(2_000)))
  await expect(readPart('/assets/reference-a.bin', 1_000, false)).rejects.toThrow('size limit')
})

it('reads a damaged stored part from the service while connected and deletes it for the next download to store', async () => {
  stored.set(`${origin}/assets/reference-a.bin`, new Response('truncated'))
  vi.stubGlobal('fetch', async () => part(['Rules']))
  expect({ read: await readPart('/assets/reference-a.bin', 1_000, true), kept: stored.has(`${origin}/assets/reference-a.bin`) }).toEqual({
    read: ['Rules'],
    kept: false,
  })
})

/** An address the manifest accepts, named after `name`. */
const asset = (name: string) =>
  `/assets/construction-${Array.from(name, (character) => character.charCodeAt(0).toString(16))
    .join('')
    .padEnd(64, '0')}.bin`
const record = (revision: string, names: string[], editions: string[] = []): OfflineReferenceData => ({
  version: 2,
  savedAt: 1,
  appRevision: 'app',
  editions,
  download: {
    revision: revision.repeat(64),
    reference: { core: asset(`${names[0]}`), search: asset(`${names[1]}`), parts: {} },
    construction: {
      catalogue: asset(`${names[2]}`),
      rules: asset(`${names[3]}`),
      editions: Object.fromEntries([...editions, 'unused'].map((id) => [id, asset(id)])),
    },
  },
})

it('notices a part a saved download names has gone', async () => {
  const saved = record('a', ['core', 'search', 'catalogue', 'rules'], ['kept'])
  for (const name of ['core', 'search', 'catalogue', 'rules']) stored.set(`${origin}${asset(name)}`, part([]))
  const missing = await storesEvery(saved)
  stored.set(`${origin}${asset('kept')}`, part([]))
  expect([missing, await storesEvery(saved)]).toEqual([false, true])
})

it('deletes only parts neither the new download nor the one it replaces names, keeping the rules versions each saved', async () => {
  stored.set(`${origin}/offline-reference.json`, Response.json(record('a', ['core', 'search', 'old-catalogue', 'rules'], ['kept'])))
  for (const name of ['core', 'search', 'old-catalogue', 'catalogue', 'rules', 'kept', 'unused', 'stale'])
    stored.set(`${origin}${asset(name)}`, part([]))
  await saveReference(record('b', ['core', 'search', 'catalogue', 'rules']), '<!doctype html>')
  expect({ stored: [...stored.keys()].map((url) => new URL(url).pathname).toSorted(), deleted }).toEqual({
    stored: [
      ...['core', 'search', 'old-catalogue', 'catalogue', 'rules', 'kept'].map(asset),
      '/offline-reference.html',
      '/offline-reference.json',
    ].toSorted(),
    deleted: ['praetorium-reference-v2'],
  })
})
