import { afterEach, expect, it, vi } from 'vitest'

const { document, corpus, state } = vi.hoisted(() => {
  const record = {
    id: 'rule:core:move',
    kind: 'rule' as const,
    title: 'Move Units',
    faction: null,
    url: '/rules/core/movement#move',
    sections: [{ id: 'move', title: 'Move Units', text: 'Move across the battlefield.', url: '/rules/core/movement#move' }],
    revisions: { datacards: 'revision' },
    attribution: ['Community data'],
  }
  const mockState: { available: boolean; ready: boolean; worker: unknown } = { available: true, ready: true, worker: null }
  return {
    document: record,
    corpus: {
      catalogue: { revisions: { datacards: 'revision' }, datasheets: [], detachments: [], ruleDocuments: [] },
      documents: [record],
      byId: new Map([[record.id, record]]),
      revision: 'snapshot',
    },
    state: mockState,
  }
})

vi.mock('./referenceCorpus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./referenceCorpus')>()),
  referenceCorpusFor: () => (state.available ? corpus : null),
}))
vi.mock('./app', () => ({
  app: () => ({
    sync: () => ({ status: state.ready ? 'ready' : 'failed' }),
    catalogue: () => null,
    rules: () => null,
    rulesFor: async () => null,
    workerReferences: state.worker,
  }),
}))

import {
  parseReferenceSearch,
  referenceDocumentResponse,
  referenceGuideResponse,
  referenceIndexResponse,
  referenceRateLimit,
  referenceRecordResponse,
  referenceSearchResponse,
} from './referenceApi'

afterEach(() => {
  corpus.revision = 'snapshot'
  state.available = true
  state.ready = true
  state.worker = null
})

it('parses bounded reference search filters', () => {
  expect(parseReferenceSearch(new URL('https://praetorium.gg/api/reference/v1/search?q=rapid+fire&kind=rule,datasheet&limit=5'))).toEqual({
    query: 'rapid fire',
    kinds: ['rule', 'datasheet'],
    faction: undefined,
    pack: undefined,
    document: undefined,
    limit: 5,
    cursor: undefined,
  })
  expect(parseReferenceSearch(new URL('https://praetorium.gg/api/reference/v1/search?q=death+trap&kind=mission'))).toMatchObject({
    query: 'death trap',
    kinds: ['mission'],
  })
})

it.each([
  ['q=x', 'q must contain at least 2 characters'],
  ['q=movement&kind=unknown', 'kind is not supported'],
  ['q=movement&limit=100', 'limit must be an integer from 1 to 25'],
  ['q=movement&cursor=not-a-cursor', 'cursor is not valid'],
])('rejects an invalid search query', (query, error) => {
  expect(parseReferenceSearch(new URL(`https://praetorium.gg/api/reference/v1/search?${query}`))).toEqual({ error })
})

it('serves bounded JSON search with snapshot caching', async () => {
  const request = new Request('https://praetorium.gg/api/reference/v1/search?q=battlefield')
  const response = await referenceSearchResponse(request)
  const etag = response.headers.get('etag')

  expect({ status: response.status, cache: response.headers.get('cache-control'), body: await response.json() }).toMatchObject({
    status: 200,
    cache: 'public, max-age=3600',
    body: { query: 'battlefield', results: [{ id: document.id }] },
  })
  expect((await referenceSearchResponse(new Request(request, { headers: { 'If-None-Match': etag! } }))).status).toBe(304)
})

it('serves the same document as source-attributed Markdown', async () => {
  const response = await referenceDocumentResponse(
    new Request(`https://praetorium.gg/api/reference/v1/documents/${encodeURIComponent(document.id)}`, {
      headers: { Accept: 'text/markdown' },
    }),
    document.id,
  )

  expect(await response.text()).toContain('# Move Units\n\nrule\n\n## Move Units\n\nMove across the battlefield.')
})

it('serves product guidance, discovery, and the structured record behind a document', async () => {
  const guide = await (await referenceGuideResponse(new Request('https://praetorium.gg/api/reference/v1/about'))).json()
  const index = await (await referenceIndexResponse(new Request('https://praetorium.gg/api/reference/v1/'))).json()
  const record = await (
    await referenceRecordResponse(
      new Request(`https://praetorium.gg/api/reference/v1/records/${encodeURIComponent(document.id)}`),
      document.id,
    )
  ).json()

  expect(guide).toMatchObject({ agentWorkflow: expect.arrayContaining([expect.stringContaining('list_units')]) })
  expect(index).toMatchObject({ corpusRevision: 'snapshot', kinds: { rule: 1 } })
  expect(record).toMatchObject({ document, data: document })
})

it('changes an ETag when the active snapshot changes', async () => {
  const request = new Request(`https://praetorium.gg/api/reference/v1/documents/${encodeURIComponent(document.id)}`)
  const before = (await referenceDocumentResponse(request, document.id)).headers.get('etag')
  corpus.revision = 'replacement-snapshot'

  expect((await referenceDocumentResponse(request, document.id)).headers.get('etag')).not.toBe(before)
})

it('keeps an ETag stable while the active snapshot is unchanged', async () => {
  const request = new Request(`https://praetorium.gg/api/reference/v1/documents/${encodeURIComponent(document.id)}`)

  expect((await referenceDocumentResponse(request, document.id)).headers.get('etag')).toBe(
    (await referenceDocumentResponse(request, document.id)).headers.get('etag'),
  )
})

it('returns not found for an unknown reference document', async () => {
  expect((await referenceDocumentResponse(new Request('https://praetorium.gg/api/reference/v1/documents/missing'), 'missing')).status).toBe(
    404,
  )
})

it('uses the Worker reference lookup for a document and preserves not found', async () => {
  state.worker = { referenceForDocument: async (id: string) => (id === document.id ? corpus : null) }
  const found = await referenceDocumentResponse(new Request('https://praetorium.gg/api/reference/v1/documents/move'), document.id)
  const missing = await referenceDocumentResponse(new Request('https://praetorium.gg/api/reference/v1/documents/missing'), 'missing')
  expect([found.status, missing.status]).toEqual([200, 404])
})

it('serves Worker references on the first request while catalogue status is loading', async () => {
  state.ready = false
  state.worker = {
    referenceMetadata: async () => ({
      revision: 'snapshot',
      index: { corpusRevision: 'snapshot', missionPacks: [], ruleDocuments: [], factions: [] },
    }),
    searchReferences: async () => ({ query: 'movement', results: [], revisions: {}, nextCursor: null }),
  }

  const search = await referenceSearchResponse(new Request('https://praetorium.gg/api/reference/v1/search?q=movement'))
  const index = await referenceIndexResponse(new Request('https://praetorium.gg/api/reference/v1/'))
  expect([search.status, index.status]).toEqual([200, 200])
})

it('returns unavailable rather than an empty reference', async () => {
  state.available = false

  expect((await referenceSearchResponse(new Request('https://praetorium.gg/api/reference/v1/search?q=movement'))).status).toBe(503)
})

it('stops serving a memoized corpus when authoritative sync fails', async () => {
  expect((await referenceSearchResponse(new Request('https://praetorium.gg/api/reference/v1/search?q=movement'))).status).toBe(200)
  state.ready = false

  expect((await referenceSearchResponse(new Request('https://praetorium.gg/api/reference/v1/search?q=movement'))).status).toBe(503)
})

it('bounds unique rate-limit buckets and recovers after the window', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
  try {
    for (let index = 0; index < 10_000; index += 1) {
      expect(referenceRateLimit(new Request('https://praetorium.gg', { headers: { 'X-Forwarded-For': `192.0.2.${index}` } }), 1)).toBeNull()
    }

    expect(referenceRateLimit(new Request('https://praetorium.gg', { headers: { 'X-Forwarded-For': '198.51.100.1' } }), 1)?.status).toBe(
      429,
    )
    vi.advanceTimersByTime(60_000)
    expect(referenceRateLimit(new Request('https://praetorium.gg', { headers: { 'X-Forwarded-For': '198.51.100.1' } }), 1)).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})

it('does not trust caller-controlled Cloudflare client headers', () => {
  const request = (cloudflareAddress: string) =>
    referenceRateLimit(
      new Request('https://praetorium.gg', {
        headers: { 'CF-Connecting-IP': cloudflareAddress, 'X-Forwarded-For': '192.0.2.1' },
      }),
      1,
    )

  expect(request('198.51.100.1')).toBeNull()
  expect(request('198.51.100.2')?.status).toBe(429)
})

it('rate limits individual reference reads', async () => {
  const read = () =>
    referenceDocumentResponse(
      new Request(`https://praetorium.gg/api/reference/v1/documents/${encodeURIComponent(document.id)}`, {
        headers: { 'X-Forwarded-For': '203.0.113.42' },
      }),
      document.id,
    )

  for (let request = 0; request < 120; request += 1) expect((await read()).status).toBe(200)
  expect((await read()).status).toBe(429)
})
