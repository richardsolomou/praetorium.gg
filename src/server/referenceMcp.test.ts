import { beforeEach, expect, it, vi } from 'vitest'
import type { CanonicalCatalogue } from '../contracts/catalogue'
import type { ReferenceCorpus } from './referenceCorpus'

const document = {
  id: 'rule:core:move',
  kind: 'rule' as const,
  title: 'Move Units',
  faction: 'Space Marines',
  url: '/rules/core/movement#move',
  sections: [{ id: 'move', title: 'Move Units', text: 'Move across the battlefield.', url: '/rules/core/movement#move' }],
  revisions: { datacards: 'revision' },
  attribution: ['Community data'],
}
const catalogue: CanonicalCatalogue = {
  format: 'praetorium.canonical-catalogue.v1',
  compilerVersion: 1,
  revisions: { datacards: 'revision' },
  datasheets: [],
  detachments: [],
  ruleDocuments: [],
  issues: [],
}
const corpus: ReferenceCorpus = {
  catalogue,
  documents: [document],
  byId: new Map([[document.id, document]]),
  revision: 'snapshot',
}

const { rateLimit } = vi.hoisted(() => ({ rateLimit: vi.fn(() => null as Response | null) }))

vi.mock('./referenceApi', () => ({ activeReferenceCorpus: () => corpus, referenceRateLimit: rateLimit }))

import { handleReferenceMcp, referenceMcpOptions } from './referenceMcp'

beforeEach(() => rateLimit.mockReturnValue(null))

const toolRequest = (name: string, args: object = {}) =>
  new Request('https://praetorium.gg/mcp', {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': '2025-06-18',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  })

it('serves the same reference document through MCP', async () => {
  const response = await handleReferenceMcp(toolRequest('get_reference', { id: document.id }))

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ result: { structuredContent: document } })
})

it('serves search and faction discovery through the shared corpus', async () => {
  const search = await handleReferenceMcp(toolRequest('search_reference', { query: 'battlefield' }))
  const factions = await handleReferenceMcp(toolRequest('list_factions'))

  expect(await search.json()).toMatchObject({ result: { structuredContent: { results: [{ id: document.id }] } } })
  expect(await factions.json()).toMatchObject({
    result: { structuredContent: { factions: [{ name: 'Space Marines' }], revisions: catalogue.revisions } },
  })
})

it('rejects JSON-RPC batches', async () => {
  const response = await handleReferenceMcp(
    new Request('https://praetorium.gg/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2025-06-18',
      },
      body: JSON.stringify([
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      ]),
    }),
  )

  expect({ status: response.status, body: await response.json() }).toMatchObject({
    status: 400,
    body: { error: { code: -32600 } },
  })
})

it('rejects MCP request bodies over the byte limit', async () => {
  const response = await handleReferenceMcp(
    new Request('https://praetorium.gg/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2025-06-18',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', padding: 'x'.repeat(64 * 1024) }),
    }),
  )

  expect({ status: response.status, body: await response.json() }).toMatchObject({
    status: 413,
    body: { error: { code: -32000 } },
  })
})

it('rejects stateful MCP methods', async () => {
  const response = await handleReferenceMcp(new Request('https://praetorium.gg/mcp', { method: 'GET' }))

  expect({
    status: response.status,
    allow: response.headers.get('allow'),
    cors: response.headers.get('access-control-allow-origin'),
  }).toEqual({
    status: 405,
    allow: 'POST',
    cors: '*',
  })
})

it('adds MCP CORS headers to rate-limit responses', async () => {
  rateLimit.mockReturnValueOnce(Response.json({ error: 'too many reference requests' }, { status: 429 }))

  const response = await handleReferenceMcp(new Request('https://praetorium.gg/mcp', { method: 'POST' }))

  expect({ status: response.status, cors: response.headers.get('access-control-allow-origin') }).toEqual({ status: 429, cors: '*' })
})

it('advertises only stateless MCP methods', () => {
  expect(referenceMcpOptions().headers.get('access-control-allow-methods')).toBe('POST, OPTIONS')
})
