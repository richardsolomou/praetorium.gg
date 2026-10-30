import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PostHog } from 'posthog-node'
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
const absoluteDocument = {
  ...document,
  url: 'https://praetorium.gg/rules/core/movement#move',
  sections: [{ ...document.sections[0], url: 'https://praetorium.gg/rules/core/movement#move' }],
}
const catalogue: CanonicalCatalogue = {
  format: 'praetorium.canonical-catalogue.v1',
  compilerVersion: 1,
  revisions: { datacards: 'revision' },
  datasheets: [
    {
      id: 'move',
      catalogueId: 'marines',
      faction: 'Space Marines',
      referenceRoute: { catalogueId: 'space-marines', slug: 'move' },
    } as CanonicalCatalogue['datasheets'][number],
  ],
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

vi.mock('./referenceApi', async () => {
  const { referenceRecord } = await import('./referenceService')
  return {
    activeReferenceCorpus: () => corpus,
    referenceDocumentFor: async (id: string) => ({ corpus, document: corpus.byId.get(id) }),
    referenceRecordFor: async (id: string) => ({ corpus, record: referenceRecord(corpus, null, id) }),
    referenceRateLimit: rateLimit,
  }
})
vi.mock('./publishedTextFiles', () => ({
  publishedTextLocations: async () => ({ files: {}, holds: () => false, recordsHolding: () => [] }),
}))
vi.mock('./app', () => ({
  app: () => ({
    catalogueFor: async () => null,
    rulesFor: async () => null,
    auth: {
      $context: Promise.resolve({ baseURL: 'https://praetorium.gg/api/auth', internalAdapter: {} }),
      mcpResource: 'https://praetorium.gg/mcp',
      issuer: 'https://praetorium.gg/api/auth',
      jwksUrl: 'https://praetorium.gg/api/auth/jwks',
    },
  }),
}))

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

const rpcRequest = (method: string, params?: object) =>
  new Request('https://praetorium.gg/mcp', {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': '2025-06-18',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) }),
  })

it('serves the same reference document through MCP', async () => {
  const response = await handleReferenceMcp(toolRequest('get_reference', { id: document.id }))

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ result: { structuredContent: absoluteDocument } })
})

it('supplies an absolute canonical citation in MCP document text', async () => {
  const response = await handleReferenceMcp(toolRequest('get_reference', { id: document.id }))
  const payload = await response.json()

  expect(payload.result.content[0].text).toContain('Canonical URL: https://praetorium.gg/rules/core/movement#move')
})

it('supplies absolute section citations in MCP search results', async () => {
  const response = await handleReferenceMcp(toolRequest('search_reference', { query: 'Move Units' }))
  const payload = await response.json()

  expect(payload.result.structuredContent.results[0].section.url).toBe('https://praetorium.gg/rules/core/movement#move')
})

it('uses the configured public origin for MCP citations', async () => {
  vi.stubEnv('APP_URL', 'https://pr-123.praetorium.gg')
  try {
    const response = await handleReferenceMcp(toolRequest('get_reference', { id: document.id }))
    const payload = await response.json()

    expect(payload.result.structuredContent.url).toBe('https://pr-123.praetorium.gg/rules/core/movement#move')
  } finally {
    vi.unstubAllEnvs()
  }
})

it('challenges account tools while keeping public reference tools available', async () => {
  vi.stubEnv('APP_URL', 'https://praetorium.gg')
  try {
    const privateResponse = await handleReferenceMcp(toolRequest('get_my_roster', { id: 'roster-1' }))
    const publicResponse = await handleReferenceMcp(toolRequest('get_reference', { id: document.id }))
    expect(privateResponse.status).toBe(401)
    expect(privateResponse.headers.get('www-authenticate')).toContain('/.well-known/oauth-protected-resource/mcp')
    expect(publicResponse.status).toBe(200)
  } finally {
    vi.unstubAllEnvs()
  }
})

describe('a signed-in call while the signing keys cannot be read', () => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const signedIn = () => {
    const request = toolRequest('get_my_roster', { id: 'roster-1' })
    request.headers.set('Authorization', `Bearer ${encode({ alg: 'ES256', kid: 'key' })}.${encode({})}.signature`)
    return request
  }
  const unreachable = vi.fn(async () => {
    throw new TypeError('fetch failed')
  })
  beforeEach(() => vi.stubGlobal('fetch', unreachable))
  afterEach(() => vi.unstubAllGlobals())

  it('asks the client to retry', async () => {
    const response = await handleReferenceMcp(signedIn())
    expect([response.status, response.headers.get('retry-after')]).toEqual([503, '5'])
  })

  it('reads the keys from this server rather than its public address', async () => {
    await handleReferenceMcp(signedIn())
    expect(String((unreachable.mock.calls[0] as unknown[])[0])).toBe('http://127.0.0.1:3000/api/auth/jwks')
  })
})

it('treats an inherited object name as an unknown tool', async () => {
  const response = await handleReferenceMcp(toolRequest('__proto__'))
  expect(response.status).toBe(200)
})

it('captures only anonymous MCP usage in production without changing the result', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', 'phc_test')
  vi.stubEnv('VITE_POSTHOG_HOST', 'https://us.i.posthog.com')
  const capture = vi.spyOn(PostHog.prototype, 'capture').mockImplementation(() => undefined)
  try {
    const response = await handleReferenceMcp(toolRequest('search_reference', { query: 'battlefield' }))

    expect({
      result: await response.json(),
      event: capture.mock.calls.find(([input]) => input.event === '$mcp_tool_call')?.[0],
    }).toMatchObject({
      result: { result: { structuredContent: { results: [{ id: document.id }] } } },
      event: {
        event: '$mcp_tool_call',
        properties: { $mcp_tool_name: 'search_reference', $process_person_profile: false },
      },
    })
    expect(capture.mock.calls.find(([input]) => input.event === '$mcp_tool_call')?.[0].properties).not.toHaveProperty('$mcp_parameters')
  } finally {
    capture.mockRestore()
    vi.unstubAllEnvs()
  }
})

it.each([
  ['an unknown reference id', 'get_reference', { id: 'Move Units' }, 'not_found'],
  ['arguments the schema rejects', 'search_reference', { query: 'x' }, 'validation'],
])('reports %s as a bounded failure type', async (_case, tool, args, type) => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', 'phc_test')
  vi.stubEnv('VITE_POSTHOG_HOST', 'https://us.i.posthog.com')
  const capture = vi.spyOn(PostHog.prototype, 'capture').mockImplementation(() => undefined)
  try {
    await handleReferenceMcp(toolRequest(tool, args))

    expect(capture.mock.calls.find(([input]) => input.event === '$mcp_tool_call')?.[0].properties).toMatchObject({
      $mcp_is_error: true,
      $mcp_error_type: type,
    })
  } finally {
    capture.mockRestore()
    vi.unstubAllEnvs()
  }
})

it('records no tool call for a tool the server does not register', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', 'phc_test')
  vi.stubEnv('VITE_POSTHOG_HOST', 'https://us.i.posthog.com')
  const capture = vi.spyOn(PostHog.prototype, 'capture').mockImplementation(() => undefined)
  try {
    await handleReferenceMcp(toolRequest('__mcpcheckup_probe_nonexistent_tool__'))

    expect(capture.mock.calls.map(([input]) => input.event)).not.toContain('$mcp_tool_call')
  } finally {
    capture.mockRestore()
    vi.unstubAllEnvs()
  }
})

it('serves search and faction discovery through the shared corpus', async () => {
  const search = await handleReferenceMcp(toolRequest('search_reference', { query: 'battlefield' }))
  const factions = await handleReferenceMcp(toolRequest('list_factions'))

  expect(await search.json()).toMatchObject({ result: { structuredContent: { results: [{ id: document.id }] } } })
  expect(await factions.json()).toMatchObject({
    result: { structuredContent: { factions: [{ name: 'Space Marines' }], revisions: catalogue.revisions } },
  })
})

it('repeats each tool title in its annotations for directory listings', async () => {
  const response = await handleReferenceMcp(rpcRequest('tools/list'))
  const { tools } = ((await response.json()) as { result: { tools: { title: string; annotations: { title?: string } }[] } }).result

  expect(tools.filter((tool) => tool.annotations.title !== tool.title)).toEqual([])
})

it('marks every write tool open-world because its results can be visible to other players', async () => {
  const response = await handleReferenceMcp(rpcRequest('tools/list'))
  const { tools } = (
    (await response.json()) as { result: { tools: { name: string; annotations: { readOnlyHint?: boolean; openWorldHint?: boolean } }[] } }
  ).result

  expect(
    tools.filter((tool) => !tool.annotations.readOnlyHint && tool.annotations.openWorldHint !== true).map((tool) => tool.name),
  ).toEqual([])
})

it('advertises product instructions, read-only tools, resources, and prompts', async () => {
  const initialized = await handleReferenceMcp(
    rpcRequest('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0.0' },
    }),
  )
  const tools = await handleReferenceMcp(rpcRequest('tools/list'))
  const resources = await handleReferenceMcp(rpcRequest('resources/list'))
  const prompts = await handleReferenceMcp(rpcRequest('prompts/list'))

  expect(await initialized.json()).toMatchObject({ result: { instructions: expect.stringContaining('list_units') } })
  expect(await tools.json()).toMatchObject({
    result: {
      tools: expect.arrayContaining([
        expect.objectContaining({
          name: 'list_units',
          annotations: {
            title: 'List compact faction units for roster planning',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
          outputSchema: expect.any(Object),
        }),
        expect.objectContaining({ name: 'get_reference_record' }),
        expect.objectContaining({ name: 'list_reference' }),
        expect.objectContaining({ name: 'simulate_combat', annotations: expect.objectContaining({ readOnlyHint: true }) }),
      ]),
    },
  })
  expect(await resources.json()).toMatchObject({
    result: { resources: expect.arrayContaining([expect.objectContaining({ uri: 'praetorium://guide' })]) },
  })
  expect(await prompts.json()).toMatchObject({
    result: { prompts: expect.arrayContaining([expect.objectContaining({ name: 'explain_mission_matchup' })]) },
  })
})

it('serves reference discovery and structured records through MCP', async () => {
  const index = await handleReferenceMcp(toolRequest('list_reference'))
  const record = await handleReferenceMcp(toolRequest('get_reference_record', { id: document.id }))
  const guide = await handleReferenceMcp(rpcRequest('resources/read', { uri: 'praetorium://guide' }))

  expect(await index.json()).toMatchObject({
    result: { structuredContent: { corpusRevision: 'snapshot', factions: [{ name: 'Space Marines' }] } },
  })
  expect(await record.json()).toMatchObject({ result: { structuredContent: { document: absoluteDocument, data: absoluteDocument } } })
  expect(await guide.json()).toMatchObject({
    result: {
      contents: [
        { text: expect.stringMatching(/shooting and melee.*\/docs.*standalone combat simulator without an account.*## Agent workflow/s) },
      ],
    },
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

it('keeps browser resource adapters out of MCP discovery metadata', async () => {
  const response = await handleReferenceMcp(rpcRequest('resources/list'))
  const payload = await response.json()
  expect(payload.result.resources.map((resource: Record<string, unknown>) => Object.keys(resource).sort())).toEqual([
    ['description', 'mimeType', 'name', 'title', 'uri'],
    ['description', 'mimeType', 'name', 'title', 'uri'],
  ])
})
