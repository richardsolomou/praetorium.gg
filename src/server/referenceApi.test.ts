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
  return {
    document: record,
    corpus: {
      catalogue: { revisions: { datacards: 'revision' } },
      documents: [record],
      byId: new Map([[record.id, record]]),
      revision: 'snapshot',
    },
    state: { available: true, ready: true },
  }
})

vi.mock('./referenceCorpus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./referenceCorpus')>()),
  referenceCorpusFor: () => (state.available ? corpus : null),
}))
vi.mock('./app', () => ({ app: () => ({ sync: () => ({ status: state.ready ? 'ready' : 'failed' }) }) }))

import {
  parseReferenceSearch,
  referenceDocumentResponse,
  referenceOpenApi,
  referenceRateLimit,
  referenceSearchResponse,
} from './referenceApi'

afterEach(() => {
  corpus.revision = 'snapshot'
  state.available = true
  state.ready = true
})

it('parses bounded reference search filters', () => {
  expect(parseReferenceSearch(new URL('https://praetorium.gg/api/reference/v1/search?q=rapid+fire&kind=rule,datasheet&limit=5'))).toEqual({
    query: 'rapid fire',
    kinds: ['rule', 'datasheet'],
    faction: undefined,
    limit: 5,
  })
})

it.each([
  ['q=x', 'q must contain at least 2 characters'],
  ['q=movement&kind=unknown', 'kind is not supported'],
  ['q=movement&limit=100', 'limit must be an integer from 1 to 25'],
])('rejects an invalid search query', (query, error) => {
  expect(parseReferenceSearch(new URL(`https://praetorium.gg/api/reference/v1/search?${query}`))).toEqual({ error })
})

it('serves bounded JSON search with snapshot caching', async () => {
  const request = new Request('https://praetorium.gg/api/reference/v1/search?q=battlefield')
  const response = referenceSearchResponse(request)
  const etag = response.headers.get('etag')

  expect({ status: response.status, cache: response.headers.get('cache-control'), body: await response.json() }).toMatchObject({
    status: 200,
    cache: 'public, max-age=3600',
    body: { query: 'battlefield', results: [{ id: document.id }] },
  })
  expect(referenceSearchResponse(new Request(request, { headers: { 'If-None-Match': etag! } })).status).toBe(304)
})

it('serves the same document as source-attributed Markdown', async () => {
  const response = referenceDocumentResponse(
    new Request(`https://praetorium.gg/api/reference/v1/documents/${encodeURIComponent(document.id)}`, {
      headers: { Accept: 'text/markdown' },
    }),
    document.id,
  )

  expect(await response.text()).toContain('# Move Units\n\nrule\n\n## Move Units\n\nMove across the battlefield.')
})

it('changes an ETag when the active snapshot changes', () => {
  const request = new Request(`https://praetorium.gg/api/reference/v1/documents/${encodeURIComponent(document.id)}`)
  const before = referenceDocumentResponse(request, document.id).headers.get('etag')
  corpus.revision = 'replacement-snapshot'

  expect(referenceDocumentResponse(request, document.id).headers.get('etag')).not.toBe(before)
})

it('keeps an ETag stable while the active snapshot is unchanged', () => {
  const request = new Request(`https://praetorium.gg/api/reference/v1/documents/${encodeURIComponent(document.id)}`)

  expect(referenceDocumentResponse(request, document.id).headers.get('etag')).toBe(
    referenceDocumentResponse(request, document.id).headers.get('etag'),
  )
})

it('returns not found for an unknown reference document', () => {
  expect(referenceDocumentResponse(new Request('https://praetorium.gg/api/reference/v1/documents/missing'), 'missing').status).toBe(404)
})

it('returns unavailable rather than an empty reference', () => {
  state.available = false

  expect(referenceSearchResponse(new Request('https://praetorium.gg/api/reference/v1/search?q=movement')).status).toBe(503)
})

it('stops serving a memoized corpus when authoritative sync fails', () => {
  expect(referenceSearchResponse(new Request('https://praetorium.gg/api/reference/v1/search?q=movement')).status).toBe(200)
  state.ready = false

  expect(referenceSearchResponse(new Request('https://praetorium.gg/api/reference/v1/search?q=movement')).status).toBe(503)
})

it('publishes concrete OpenAPI response contracts', () => {
  const openApi = referenceOpenApi(new Request('https://praetorium.gg/api/reference/v1/openapi.json'))

  expect(openApi).toMatchObject({
    paths: {
      '/api/reference/v1/search': {
        get: {
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/ReferenceSearchResponse' } } } },
            '400': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '429': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '503': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
    },
    components: {
      schemas: {
        ReferenceSearchResponse: { required: ['query', 'results', 'revisions'] },
        DatasheetRecord: {
          properties: { data: { $ref: '#/components/schemas/Datasheet' } },
          required: ['kind', 'canonicalUrl', 'revisions', 'attribution', 'data'],
        },
        RuleSectionData: { required: ['document', 'section'] },
        RuleBlock: { oneOf: expect.arrayContaining([expect.objectContaining({ required: ['kind', 'markup'] })]) },
        Error: { required: ['error'] },
      },
    },
  })
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

it('rate limits individual reference reads', () => {
  const read = () =>
    referenceDocumentResponse(
      new Request(`https://praetorium.gg/api/reference/v1/documents/${encodeURIComponent(document.id)}`, {
        headers: { 'X-Forwarded-For': '203.0.113.42' },
      }),
      document.id,
    )

  for (let request = 0; request < 120; request += 1) expect(read().status).toBe(200)
  expect(read().status).toBe(429)
})
