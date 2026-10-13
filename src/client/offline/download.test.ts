import { gzipSync } from 'node:zlib'
import { afterEach, expect, it, vi } from 'vitest'
import { referenceBundle, offlineReferenceVersion, offlineAppVersion } from './download'
import type { OfflineReferenceData } from '../../contracts/offlineReference'
const revision = 'a'.repeat(64)
const version = { revision, bundle: `/assets/reference-${revision}.bin` }
const saved: OfflineReferenceData = {
  version: 1,
  revision,
  savedAt: 1,
  appRevision: 'old-app',
  queries: [{ key: ['rule-index'], data: [] }],
  search: { factions: [], detachments: [], datasheets: [], rules: [], missions: [] },
  css: '',
  logo: '',
}
const signal = new AbortController().signal
afterEach(() => vi.unstubAllGlobals())
const response = (value: unknown) => new Response(gzipSync(JSON.stringify(value)))
it('reuses the saved corpus for an application-only update without a download', async () => {
  const fetch = vi.fn(async () => response(saved))
  vi.stubGlobal('fetch', fetch)
  expect(await referenceBundle(version, signal, saved)).toEqual(saved)
  expect(fetch).not.toHaveBeenCalled()
})
it('downloads a new complete corpus in one anonymous compressed request', async () => {
  const fetch = vi.fn(async () => response(saved))
  vi.stubGlobal('fetch', fetch)
  expect(await referenceBundle(version, signal, { ...saved, revision: 'old' })).toEqual(saved)
  expect(fetch.mock.calls).toEqual([[version.bundle, expect.objectContaining({ credentials: 'omit' })]])
})
it('preserves Unicode split across decompressed response chunks', async () => {
  const value = { ...saved, css: '…'.repeat(22_000) }
  vi.stubGlobal('fetch', async () => response(value))
  expect(await referenceBundle(version, signal)).toEqual(value)
})

it('restores shared version data before accepting and saving a download', async () => {
  const base = { version: 1, revision: 'base', files: [], datacards: null, mfm: null, rules: { core: ['Rule'] } }
  const selected = {
    ...base,
    edition: {
      id: 'preview',
      name: 'Preview',
      status: 'preview',
      default: false,
      catalogueIds: ['army'],
      releases: [{ at: 1, status: 'preview' }],
    },
    rules: { $praetoriumBase: [] },
  }
  const wire = { ...saved, version: 2, construction: { ...base, editions: [selected] } }
  vi.stubGlobal('fetch', async () => response(wire))
  expect(await referenceBundle(version, signal)).toEqual({
    ...wire,
    version: 1,
    construction: { ...base, editions: [{ ...selected, rules: base.rules }] },
  })
})
it.each([
  { ...saved, revision: 'wrong' },
  { ...saved, queries: [{ key: ['me'], data: { id: 'private' } }] },
  { ...saved, search: {} },
])('rejects mismatched, private or incomplete reference data', async (value) => {
  vi.stubGlobal('fetch', async () => response(value))
  await expect(referenceBundle(version, signal)).rejects.toThrow('bundle is invalid')
})
it('rejects an unavailable bundle without changing the saved reference', async () => {
  vi.stubGlobal('fetch', async () => new Response(null, { status: 503 }))
  await expect(referenceBundle(version, signal, { ...saved, revision: 'old' })).rejects.toThrow('unavailable')
  expect(saved.revision).toBe(revision)
})
it('cancels decompression when a download is aborted', async () => {
  const abort = new AbortController()
  const cancelled = vi.fn()
  vi.stubGlobal('fetch', async () => new Response(new ReadableStream({ cancel: cancelled })))
  const download = referenceBundle(version, abort.signal)
  await new Promise((resolve) => setTimeout(resolve, 0))
  abort.abort()
  await expect(download).rejects.toThrow()
  await vi.waitFor(() => expect(cancelled).toHaveBeenCalledOnce())
})
it('rejects decompressed data above the device limit', async () => {
  vi.stubGlobal('fetch', async () => new Response(gzipSync(Buffer.alloc(100_000_001, 32))))
  await expect(referenceBundle(version, signal)).rejects.toThrow('download limit')
})
it('rejects manifests that point outside immutable application assets', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json({ revision, css: '/assets/style-hash.css', script: 'https://other.test/app.js', bundle: '/private' }),
  )
  await expect(offlineReferenceVersion(signal)).rejects.toThrow('version is invalid')
  await expect(offlineAppVersion(signal)).rejects.toThrow('version is invalid')
})
