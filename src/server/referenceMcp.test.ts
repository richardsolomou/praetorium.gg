import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ruleSummaryFinder } from './referenceSummaries'
import { readFileSync, writeFileSync } from 'node:fs'
import { PostHog } from 'posthog-node'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
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
  summaries: ruleSummaryFinder(null),
}

const { hasMcpConsent, importCollection, rateLimit } = vi.hoisted(() => ({
  importCollection: vi.fn(),
  hasMcpConsent: vi.fn(async () => true),
  rateLimit: vi.fn(() => null as Response | null),
}))

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
  textHomeOf: async () => () => null,
}))
vi.mock('./servedVsData', () => ({ servedVsDataSummaries: async () => null }))
vi.mock('./app', () => ({
  app: () => ({
    searchIndexFor: async () => null,
    catalogueFor: async () => null,
    rulesFor: async () => null,
    service: { rosterService: { importCollection } },
    telemetry: { posthog: { capture: vi.fn() } },
    auth: {
      $context: Promise.resolve({ baseURL: 'https://praetorium.gg/api/auth', internalAdapter: {}, getPlugin: () => undefined }),
      mcpResource: 'https://praetorium.gg/mcp',
      issuer: 'https://praetorium.gg/api/auth',
      hasMcpConsent,
    },
  }),
}))

import { handleReferenceMcp, referenceMcpOptions } from './referenceMcp'

beforeEach(() => {
  rateLimit.mockReturnValue(null)
  hasMcpConsent.mockResolvedValue(true)
  importCollection.mockReset()
})

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

describe('an account tool called without signing in', () => {
  beforeEach(() => vi.stubEnv('APP_URL', 'https://praetorium.gg'))
  afterEach(() => vi.unstubAllEnvs())

  // A transport 401 makes clients such as Claude Code drop the whole server, public tools included.
  it('answers with a tool error rather than a transport challenge', async () => {
    const response = await handleReferenceMcp(toolRequest('get_my_roster', { id: 'roster-1' }))
    expect([response.status, (await response.json()).result.isError]).toEqual([200, true])
  })

  it('carries the sign-in challenge on the tool error', async () => {
    const response = await handleReferenceMcp(toolRequest('list_my_battles'))
    const payload = await response.json()
    expect(payload.result._meta['mcp/www_authenticate'][0]).toContain(
      'resource_metadata="https://praetorium.gg/.well-known/oauth-protected-resource/mcp"',
    )
  })
})

it('declares which tools need an account', async () => {
  const response = await handleReferenceMcp(rpcRequest('tools/list', {}))
  const tools: { name: string; _meta?: { securitySchemes?: unknown } }[] = (await response.json()).result.tools
  const schemes = Object.fromEntries(tools.map((tool) => [tool.name, tool._meta?.securitySchemes]))
  expect([schemes.get_my_roster, schemes.get_reference]).toEqual([[{ type: 'oauth2', scopes: ['mcp:read'] }], [{ type: 'noauth' }]])
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
    const request = toolRequest('search_reference', { query: 'battlefield' })
    request.headers.set('User-Agent', 'claude-user/1.0 (+https://www.anthropic.com)')
    const response = await handleReferenceMcp(request)

    expect({
      result: await response.json(),
      event: capture.mock.calls.find(([input]) => input.event === '$mcp_tool_call')?.[0],
    }).toMatchObject({
      result: { result: { structuredContent: { results: [{ id: document.id }] } } },
      event: {
        event: '$mcp_tool_call',
        properties: {
          $mcp_tool_name: 'search_reference',
          $mcp_tool_category: 'reference',
          $mcp_client_name: 'claude-user',
        },
        options: { process_person_profile: false },
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

it('tells every client to load the matching skill before planning a list', async () => {
  const initialized = await handleReferenceMcp(
    rpcRequest('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } }),
  )
  expect(await initialized.json()).toMatchObject({ result: { instructions: expect.stringMatching(/get_skill.*build-a-roster/) } })
})

it('serves a skill through a tool for clients that never read prompts', async () => {
  const response = await handleReferenceMcp(toolRequest('get_skill', { name: 'build-a-roster' }))
  expect(await response.json()).toMatchObject({ result: { content: [{ text: expect.stringContaining('# Build a roster') }] } })
})

it('offers each skill as a prompt', async () => {
  const response = await handleReferenceMcp(rpcRequest('prompts/get', { name: 'compare-units' }))
  expect(await response.json()).toMatchObject({
    result: { messages: [{ content: { text: expect.stringContaining('# Compare units') } }] },
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

const requestSigningKeys = generateKeyPair('ES256')

async function signedRequest(request: Request, scope: string) {
  const { privateKey, publicKey } = await requestSigningKeys
  const key = await exportJWK(publicKey)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ keys: [{ ...key, kid: 'collection-import' }] })),
  )
  const token = await new SignJWT({ scope, azp: 'review-client', client_id: 'review-client' })
    .setProtectedHeader({ alg: 'ES256', kid: 'collection-import' })
    .setIssuer('https://praetorium.gg/api/auth')
    .setAudience('https://praetorium.gg/mcp')
    .setSubject('collector')
    .setExpirationTime('5m')
    .sign(privateKey)
  request.headers.set('authorization', `Bearer ${token}`)
  return request
}

it('accepts a large collection replacement in one management call', async () => {
  const rows = Array.from({ length: 800 }, (_, i) => ({
    entryId: `70f49209-98f3-4307-9ced-${String(i).padStart(12, '0')}`,
    models: 5,
    built: 3,
    painted: 2,
    wanted: 1,
  }))
  importCollection.mockResolvedValueOnce({ imported: 800 })
  try {
    const response = await handleReferenceMcp(await signedRequest(toolRequest('import_collection', { rows, replace: true }), 'mcp:manage'))
    expect(response.status).toBe(200)
    expect(importCollection).toHaveBeenCalledWith('collector', rows, true)
  } finally {
    vi.unstubAllGlobals()
  }
})

it('challenges an existing read and write grant for management access', async () => {
  try {
    const rows = [{ entryId: 'marines', models: 1, built: 0, painted: 0, wanted: 0 }]
    const response = await handleReferenceMcp(
      await signedRequest(toolRequest('import_collection', { rows, replace: false }), 'mcp:read mcp:write'),
    )
    expect({ status: response.status, challenge: response.headers.get('www-authenticate') }).toMatchObject({
      status: 403,
      challenge: expect.stringContaining('scope="mcp:manage"'),
    })
    expect(importCollection).not.toHaveBeenCalled()
  } finally {
    vi.unstubAllGlobals()
  }
})

it('refuses a management token when the required grant is gone', async () => {
  hasMcpConsent.mockResolvedValue(false)
  try {
    const rows = [{ entryId: 'marines', models: 1, built: 0, painted: 0, wanted: 0 }]
    const response = await handleReferenceMcp(await signedRequest(toolRequest('import_collection', { rows, replace: false }), 'mcp:manage'))
    expect(response.status).toBe(401)
    expect(importCollection).not.toHaveBeenCalled()
  } finally {
    vi.unstubAllGlobals()
  }
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

it('offers battle invites, organizer actions and collection edits as signed-in tools', async () => {
  const response = await handleReferenceMcp(rpcRequest('tools/list'))
  const { tools } = (await response.json()).result
  expect(
    tools
      .filter((tool: { name: string }) =>
        ['get_battle_invite', 'join_battle', 'report_league_result', 'pair_tournament_round', 'set_collection_models'].includes(tool.name),
      )
      .map((tool: { name: string; _meta: { securitySchemes: { scopes: string[] }[] } }) => [
        tool.name,
        tool._meta.securitySchemes[0]?.scopes[0],
      ])
      .sort(),
  ).toEqual([
    ['get_battle_invite', 'mcp:read'],
    ['join_battle', 'mcp:manage'],
    ['pair_tournament_round', 'mcp:manage'],
    ['report_league_result', 'mcp:manage'],
    ['set_collection_models', 'mcp:manage'],
  ])
})

it('keeps every published tool and argument', async () => {
  const response = await handleReferenceMcp(rpcRequest('tools/list'))
  const { tools } = ((await response.json()) as { result: { tools: { name: string; inputSchema: { properties?: object } }[] } }).result
  const served = new Map(tools.map((tool) => [tool.name, Object.keys(tool.inputSchema.properties ?? {})]))
  if (process.env.WRITE_MCP_SURFACE)
    writeFileSync(
      'src/server/mcpSurface.json',
      `${JSON.stringify(Object.fromEntries([...served].toSorted(([left], [right]) => left.localeCompare(right))), null, 2)}\n`,
    )
  const published = JSON.parse(readFileSync('src/server/mcpSurface.json', 'utf8')) as Record<string, string[]>

  expect(
    Object.entries(published).flatMap(([name, args]) =>
      served.has(name) ? args.filter((arg) => !served.get(name)!.includes(arg)).map((arg) => `${name}.${arg}`) : [name],
    ),
  ).toEqual([])
})
