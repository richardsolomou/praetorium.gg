import { beforeEach, expect, it, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { reduceBattle, type Command } from '../core/battle'
import { ALICE, BOB, NAMES, PLAYERS, log, roster, started } from '../core/battle.fixtures'
import { battleView } from '../core/battleView'

const { submit, seatedBattle, createBattle, capture, rules } = vi.hoisted(() => ({
  submit: vi.fn(),
  seatedBattle: vi.fn(),
  createBattle: vi.fn(),
  capture: vi.fn(),
  rules: { value: null } as { value: unknown },
}))
vi.mock('./publishedTextFiles', () => ({
  publishedTextLocations: async () => ({ files: {}, holds: () => false, recordsHolding: () => [] }),
}))
vi.mock('./app', () => ({
  app: () => ({
    service: { submit, seatedBattle, createBattle },
    telemetry: { capture },
    rulesFor: async () => rules.value,
    battleDetachmentDataFor: async () => null,
  }),
}))

import { AgentTools } from './agentTools'
import { registerBattleTools } from './battleTools'

beforeEach(() => {
  capture.mockReset()
  rules.value = null
})

async function call(userId: string, name: string, args: object) {
  const server = new McpServer({ name: 'battle-test', version: '1.0.0' })
  const tools = new AgentTools()
  registerBattleTools(tools, userId)
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

/** The service's answer for a battle folded from this log, read from `viewer`'s seat. */
function seated(viewer: string, entries: [string, Command][], missions: { side: number; mission: { id: string } | null }[] = []) {
  const state = reduceBattle(PLAYERS, log(...entries))
  seatedBattle.mockResolvedValueOnce({
    screen: { kind: 'battle', view: battleView({ token: 'battle-1' }, NAMES, state, viewer), missions },
    state,
  })
}

const battleAction = (command: object) => call('player-1', 'submit_battle_action', { token: 'battle-1', expectedSeq: 4, command })

it('submits a battle command with the current sequence and account identity', async () => {
  submit.mockResolvedValueOnce({ result: { outcome: 'appended' } })
  await battleAction({ kind: 'set-painted', painted: true })
  expect(submit).toHaveBeenLastCalledWith('battle-1', 'player-1', 4, { kind: 'set-painted', painted: true }, null)
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
  await battleAction({ kind: 'set-painted', painted: true })
  expect(capture.mock.calls.map(([, event, { battle_id }]) => [event, battle_id])).toEqual([['battle_command_submitted', 'battle-id']])
})

it('keeps the internal battle id out of an agent’s battle action answer', async () => {
  submit.mockResolvedValueOnce({ result: { outcome: 'appended', seq: 5 }, battleId: 'battle-id' })
  const response = await battleAction({ kind: 'set-painted', painted: true })
  expect(response.result.structuredContent).not.toHaveProperty('battleId')
})

it('reports a battle an agent’s command finished, with its battle and why', async () => {
  submit.mockResolvedValueOnce({ result: { outcome: 'appended', seq: 5 }, battleId: 'battle-id', finished: 'completed' })
  await battleAction({ kind: 'advance' })
  expect(capture).toHaveBeenLastCalledWith('player-1', 'battle_finished', {
    battle_id: 'battle-id',
    reason: 'completed',
    delivery: 'direct',
    via: 'agent',
  })
})

it('changes only the battle settings an agent names', async () => {
  seated(ALICE, [
    [
      ALICE,
      {
        kind: 'configure-battle',
        limit: 2000,
        missionPackId: 'chapter-approved',
        terrainLayoutId: null,
        twistId: null,
        clockLimitMinutes: null,
      },
    ],
  ])
  submit.mockResolvedValueOnce({ result: { outcome: 'appended' } })
  await battleAction({ kind: 'configure-battle', missionPackId: 'pariah-nexus' })
  expect(submit.mock.lastCall?.[3]).toMatchObject({ limit: 2000, missionPackId: 'pariah-nexus' })
})

it('prepares a side’s mission cards from its matchup and the whole secondary deck', async () => {
  const card = (key: string) => ({ key, name: key, awards: [] })
  rules.value = { primaries: [card('take-and-hold')], secondaries: [card('assassination'), card('bring-it-down')] }
  seated(
    ALICE,
    [
      [ALICE, roster('Ultramarines')],
      [BOB, roster('Death Guard')],
    ],
    [{ side: 0, mission: { id: 'take-and-hold' } }],
  )
  submit.mockResolvedValueOnce({ result: { outcome: 'appended' } })
  await battleAction({ kind: 'set-secondaries', mode: 'tactical', playerId: ALICE })
  expect(submit.mock.lastCall?.[3]).toEqual({
    kind: 'set-prep',
    playerId: ALICE,
    stratagems: [],
    secondaries: [],
    secondaryDeck: [card('assassination'), card('bring-it-down')],
    primary: card('take-and-hold'),
    secondaryMode: 'tactical',
  })
})

it('tells an agent a battle cannot begin until both armies are in', async () => {
  seated(ALICE, [[ALICE, roster('Ultramarines')]])
  const response = await call(ALICE, 'get_my_battle', { token: 'battle-1' })
  expect(response.result.structuredContent.next.begin.refusal).toBe('both armies need a list')
})

it('offers either seat the active player’s phase to end', async () => {
  seated(BOB, started())
  const response = await call(BOB, 'get_my_battle', { token: 'battle-1' })
  expect(response.result.structuredContent.next.allowed).toContain('advance')
})
