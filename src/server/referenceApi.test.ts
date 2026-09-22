import { expect, it, vi } from 'vitest'

const { document, corpus } = vi.hoisted(() => {
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
  }
})

vi.mock('./referenceCorpus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./referenceCorpus')>()),
  referenceCorpusFor: () => corpus,
}))
vi.mock('./app', () => ({ app: () => ({}) }))

import { parseReferenceSearch, referenceDocumentResponse, referenceRateLimit, referenceSearchResponse } from './referenceApi'

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

it('bounds unique rate-limit buckets and recovers after the window', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
  try {
    for (let index = 0; index < 10_000; index += 1) {
      expect(
        referenceRateLimit(new Request('https://praetorium.gg', { headers: { 'CF-Connecting-IP': `192.0.2.${index}` } }), 1),
      ).toBeNull()
    }

    expect(referenceRateLimit(new Request('https://praetorium.gg', { headers: { 'CF-Connecting-IP': '198.51.100.1' } }), 1)?.status).toBe(
      429,
    )
    vi.advanceTimersByTime(60_000)
    expect(referenceRateLimit(new Request('https://praetorium.gg', { headers: { 'CF-Connecting-IP': '198.51.100.1' } }), 1)).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})
