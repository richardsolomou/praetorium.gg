import { beforeEach, expect, it, vi } from 'vitest'
import { AgentTools } from './agentTools'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

const { ownRoster, saveOwnedRoster, setRosterVisibility, capture, shelf, battles, playerProfile, playerRankings } = vi.hoisted(() => ({
  shelf: { value: null as LoadedCatalogue | null },
  ownRoster: vi.fn(),
  saveOwnedRoster: vi.fn(),
  setRosterVisibility: vi.fn(),
  capture: vi.fn(),
  battles: vi.fn(),
  playerProfile: vi.fn(),
  playerRankings: vi.fn(),
}))
vi.mock('./saveOwnedRoster', () => ({ saveOwnedRoster }))
vi.mock('./publishedTextFiles', () => ({
  publishedTextLocations: async () => ({ files: {}, holds: () => false, recordsHolding: () => [] }),
}))
vi.mock('./app', () => ({
  app: () => ({
    service: {
      battleFeedService: { battles },
      profileService: { playerProfile },
      standingsService: { playerRankings },
      sealedEventService: { ownRoster },
      rosterService: { setRosterVisibility },
    },
    telemetry: { capture },
    catalogueFor: async () => shelf.value,
    rulesFor: async () => null,
    battleFactionsFor: async () => [],
  }),
}))

import { registerAccountMcpTools } from './accountMcp'
import { bookOf, points } from './catalogue.fixtures'
import type { LoadedCatalogue } from './catalogueIndex'

beforeEach(() => capture.mockReset())

const events = () => capture.mock.calls.map(([, event]) => event)
const roster = { name: '', catalogueId: 'necrons', detachmentIds: [], disposition: null, limit: 1_000, picks: [], prep: null }

async function call(userId: string, name: string, args: object) {
  const server = new McpServer({ name: 'account-test', version: '1.0.0' })
  const tools = new AgentTools()
  registerAccountMcpTools(tools, userId)
  tools.registerMcp(server, 'https://praetorium.gg')
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  try {
    const response = await transport.handleRequest(
      new Request('https://praetorium.gg/mcp', {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': '2025-06-18',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      }),
    )
    return response.json()
  } finally {
    await server.close()
  }
}

it('reads only the signed-in player’s roster', async () => {
  ownRoster.mockResolvedValueOnce({ id: 'roster-1', name: 'My army' })
  const response = await call('player-1', 'get_my_roster', { id: 'roster-1' })
  expect(response.result.structuredContent.roster.name).toBe('My army')
  expect(ownRoster).toHaveBeenLastCalledWith('player-1', 'roster-1')
})

it('names each unit of a saved roster with its points, so an assistant need not resolve catalogue ids', async () => {
  shelf.value = bookOf({ selectionEntries: [{ id: 'overlord', name: 'Overlord', type: 'model', costs: points(85) }] })
  ownRoster.mockResolvedValueOnce({ ...roster, id: 'roster-1', name: 'My army', catalogueId: 'cat', picks: [{ entryId: 'overlord' }] })
  const response = await call('player-1', 'get_my_roster', { id: 'roster-1' })
  shelf.value = null
  expect(response.result.structuredContent.summary).toMatchObject({ points: 85, units: [{ name: 'Overlord', points: 85, entry: 1 }] })
})

it('links a saved roster to its page so the assistant can share it', async () => {
  saveOwnedRoster.mockResolvedValueOnce({ id: 'roster-1', updatedAt: 1 })
  const response = await call('player-1', 'save_roster', roster)
  expect(response.result.structuredContent.url).toBe('https://praetorium.gg/rosters/roster-1')
})

it('does not return a roster the player does not own', async () => {
  ownRoster.mockResolvedValueOnce(null)
  const response = await call('player-1', 'get_my_roster', { id: 'someone-elses-roster' })
  expect(response.result.isError).toBe(true)
})

it('counts a roster an agent creates', async () => {
  saveOwnedRoster.mockResolvedValueOnce({ id: 'roster-1', created: true, updatedAt: 1 })
  await call('player-1', 'save_roster', roster)
  expect(events()).toEqual(['roster_created'])
})

it('does not count an agent’s edit of a saved roster as a creation', async () => {
  saveOwnedRoster.mockResolvedValueOnce({ id: 'roster-1', created: false, updatedAt: 1 })
  await call('player-1', 'save_roster', { ...roster, id: 'roster-1' })
  expect(events()).toEqual([])
})

it('reports a visibility change an agent makes', async () => {
  await call('player-1', 'set_roster_visibility', { id: 'roster-1', visibility: 'public' })
  expect(capture).toHaveBeenLastCalledWith('player-1', 'roster_visibility_updated', {
    visibility: 'public',
    delivery: 'direct',
    via: 'agent',
  })
})

it.each([
  ['current-rosters~2261-79a5-19d9-1668', '2261-79a5-19d9-1668'],
  ['2261-79a5-19d9-1668', 'legacy-rosters~2261-79a5-19d9-1668'],
])('saves MCP input on %s as %s without remigrating it', async (catalogueId, expected) => {
  saveOwnedRoster.mockResolvedValueOnce({ id: 'roster-1', updatedAt: 1 })
  await call('player-1', 'save_roster', { ...roster, catalogueId, detachmentIds: ['3caf-c168-c372-51b1'] })
  expect(saveOwnedRoster).toHaveBeenLastCalledWith('player-1', expect.objectContaining({ catalogueId: expected }))
})

const finished = {
  token: 'battle-1',
  createdAt: 0,
  lastActivity: 0,
  status: 'finished',
  playerIds: ['opponent', 'player-1'],
  playerDetails: [
    { id: 'opponent', name: 'Sam', automated: false },
    { id: 'player-1', name: 'Kieran', automated: false },
  ],
  players: ['Sam', 'Kieran'],
  sides: [0, 1],
  scores: [80, 60],
  primaries: [40, 30],
  secondaries: [40, 30],
  armies: [null, null],
  factions: [null, null],
  detachments: [[], []],
  result: { reason: 'completed', concededBy: null },
  settings: { limit: 2000, missionPackId: null },
  mission: null,
  deploymentId: null,
}

it('narrows an agent’s battle list by the filter and order it asks for', async () => {
  battles.mockResolvedValueOnce({ battles: [], nextCursor: null })
  await call('player-1', 'list_my_battles', { filter: { faction: { in: ['necrons'] } }, order: 'oldest' })
  expect(battles).toHaveBeenLastCalledWith(
    'player-1',
    null,
    { limit: 25, before: undefined, filter: { faction: { in: ['necrons'], out: [] } }, order: 'oldest' },
    [],
  )
})

it('reads a listed battle’s result from the signed-in player’s seat', async () => {
  battles.mockResolvedValueOnce({ battles: [finished], nextCursor: null })
  const response = await call('player-1', 'list_my_battles', {})
  expect(response.result.structuredContent.battles[0].result).toBe('lost')
})

it('reads an agent’s statistics from its own seat, narrowed as asked', async () => {
  playerProfile.mockResolvedValueOnce({
    record: { opponents: [] },
    performance: { detachments: [], missions: [], sizes: [] },
    facets: {},
  })
  playerRankings.mockResolvedValueOnce({ overall: null, factions: [], history: [] })
  await call('player-1', 'get_my_stats', { faction: 'necrons' })
  expect(playerProfile).toHaveBeenLastCalledWith('player-1', 'player-1', { faction: 'necrons' }, null, [])
})
