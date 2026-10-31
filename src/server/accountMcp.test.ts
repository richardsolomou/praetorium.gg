import { beforeEach, expect, it, vi } from 'vitest'
import { AgentTools } from './agentTools'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

const { ownRoster, saveOwnedRoster, submit, userBattleId, screen, createBattle, setRosterVisibility, capture, shelf } = vi.hoisted(() => ({
  shelf: { value: null as LoadedCatalogue | null },
  ownRoster: vi.fn(),
  saveOwnedRoster: vi.fn(),
  submit: vi.fn(),
  userBattleId: vi.fn(),
  screen: vi.fn(),
  createBattle: vi.fn(),
  setRosterVisibility: vi.fn(),
  capture: vi.fn(),
}))
vi.mock('./saveOwnedRoster', () => ({ saveOwnedRoster }))
vi.mock('./publishedTextFiles', () => ({
  publishedTextLocations: async () => ({ files: {}, holds: () => false, recordsHolding: () => [] }),
}))
vi.mock('./app', () => ({
  app: () => ({
    service: { submit, userBattleId, screen, createBattle, sealedEventService: { ownRoster }, rosterService: { setRosterVisibility } },
    telemetry: { capture },
    catalogueFor: async () => shelf.value,
    rulesFor: async () => null,
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

it('submits a battle command with the current sequence and account identity', async () => {
  submit.mockResolvedValueOnce({ result: { outcome: 'appended' } })
  const response = await call('player-1', 'submit_battle_action', {
    token: 'battle-1',
    expectedSeq: 4,
    command: { kind: 'set-painted', painted: true },
  })
  expect(response.result.structuredContent.result.outcome).toBe('appended')
  expect(submit).toHaveBeenLastCalledWith('battle-1', 'player-1', 4, { kind: 'set-painted', painted: true }, null)
})

it('checks a battle seat before returning the private battle screen', async () => {
  userBattleId.mockRejectedValueOnce(new Response('not seated', { status: 403 }))
  const response = await call('player-1', 'get_my_battle', { token: 'private-battle' })
  expect(response.result.isError).toBe(true)
  expect(screen).not.toHaveBeenCalled()
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

it('counts a battle an agent creates as a direct creation of that battle', async () => {
  createBattle.mockResolvedValueOnce({ battleId: 'battle-id', token: 'battle-1', practice: false })
  await call('player-1', 'create_battle', { opponentId: 'opponent', casual: true })
  expect(capture.mock.calls.map(([, event, { battle_id, delivery, via }]) => [event, battle_id, delivery, via])).toEqual([
    ['battle_created', 'battle-id', 'direct', 'agent'],
  ])
})

it('reports a battle command an agent records against its battle', async () => {
  submit.mockResolvedValueOnce({ result: { outcome: 'appended', seq: 5 }, battleId: 'battle-id' })
  await call('player-1', 'submit_battle_action', { token: 'battle-1', expectedSeq: 4, command: { kind: 'set-painted', painted: true } })
  expect(capture.mock.calls.map(([, event, { battle_id }]) => [event, battle_id])).toEqual([['battle_command_submitted', 'battle-id']])
})

it('keeps the internal battle id out of an agent’s battle action answer', async () => {
  submit.mockResolvedValueOnce({ result: { outcome: 'appended', seq: 5 }, battleId: 'battle-id' })
  const response = await call('player-1', 'submit_battle_action', {
    token: 'battle-1',
    expectedSeq: 4,
    command: { kind: 'set-painted', painted: true },
  })
  expect(response.result.structuredContent).not.toHaveProperty('battleId')
})

it('reports a battle an agent’s command finished, with its battle and why', async () => {
  submit.mockResolvedValueOnce({ result: { outcome: 'appended', seq: 5 }, battleId: 'battle-id', finished: 'completed' })
  await call('player-1', 'submit_battle_action', { token: 'battle-1', expectedSeq: 4, command: { kind: 'advance' } })
  expect(capture).toHaveBeenLastCalledWith('player-1', 'battle_finished', {
    battle_id: 'battle-id',
    reason: 'completed',
    delivery: 'direct',
    via: 'agent',
  })
})
