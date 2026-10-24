import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { downloadReference, partsOf, type DownloadMessage, type DownloadRequest } from './referenceDownload'
import { restoredReference } from './referenceRestore'
import type { OfflineReferenceData } from '../../contracts/offlineReference'

const revision = 'a'.repeat(64)
const manifest = {
  revision,
  bundle: `/assets/reference-${revision}.bin`,
  construction: {
    current: `/assets/construction-${'b'.repeat(64)}.bin`,
    complete: `/assets/construction-${'c'.repeat(64)}.bin`,
    versions: [],
  },
}
const reference: OfflineReferenceData = {
  version: 1,
  revision,
  savedAt: 1,
  queries: [{ key: ['rule-index'], data: { title: 'Core rules' } }],
  search: { factions: [], detachments: [], datasheets: [], rules: [], missions: [] },
  css: '',
  logo: '',
}
const construction = { version: 1, revision: 'base', files: [], datacards: null, mfm: null, rules: {} }
const request: DownloadRequest = {
  manifest,
  version: { revision: 'app', css: '/assets/app.css', script: `/assets/offline-app-${'d'.repeat(64)}.js` },
  constructionUrl: manifest.construction.current,
  allRulesVersions: false,
  held: null,
  origin: 'https://praetorium.test',
}
const fetched: string[] = []

beforeEach(() => {
  fetched.length = 0
  vi.stubGlobal('fetch', async (url: string | URL) => {
    const path = new URL(url).pathname
    fetched.push(path)
    if (path === manifest.bundle) return new Response(gzipSync(JSON.stringify(reference)))
    if (path === manifest.construction.current) return new Response(gzipSync(JSON.stringify({ ...reference, construction })))
    return new Response('body{}')
  })
  vi.stubGlobal(
    'FileReader',
    class {
      result = 'data:image/svg+xml;base64,'
      onload = () => {}
      readAsDataURL() {
        this.onload()
      }
    },
  )
})
afterEach(() => vi.unstubAllGlobals())

async function download(held: DownloadRequest['held'] = null) {
  const events: string[] = []
  const messages: DownloadMessage[] = []
  const post = (message: DownloadMessage) => {
    events.push(`${message.kind} after ${fetched.length} requests`)
    messages.push(message)
  }
  await downloadReference({ ...request, held }, post, new AbortController().signal)
  return { events, messages, saved: messages.find((message) => message.kind === 'saved')! }
}

it('reports a new reference before downloading its construction data', async () => {
  expect((await download()).events[0]).toBe('reference after 1 requests')
})

it('does not report a reference the page already holds', async () => {
  expect((await download({ revision, parts: partsOf(reference) })).messages.map((message) => message.kind)).toEqual(['saved'])
})

it('reuses the held reference for an application-only update without downloading it', async () => {
  await download({ revision, parts: partsOf(reference), construction: 'packed' })
  expect(fetched).not.toContain(manifest.bundle)
})

it('saves an application whose reference the page restores', async () => {
  const { saved } = await download()
  expect(restoredReference(saved.parts).queries[0]!.data).toEqual(reference.queries[0]!.data)
})

it('packs downloaded construction data for the page', async () => {
  const { saved } = await download()
  expect(restoredReference(saved.parts).construction).toEqual(construction)
})

it('keeps the held construction data packed without downloading it again', async () => {
  await download({ revision: 'old', construction: 'packed' })
  expect(fetched).not.toContain(manifest.construction.current)
})

it('resolves every address against the page origin', async () => {
  const { saved } = await download()
  expect(saved.kind === 'saved' && saved.html).toContain('wss://praetorium.test')
})
