import { expect, it, vi } from 'vitest'

const { sealedEvent, sealedEventResults, reportTableResult, createSealedEventBattle } = vi.hoisted(() => ({
  sealedEvent: vi.fn(),
  sealedEventResults: vi.fn().mockResolvedValue({ rows: [], swiss: [], partial: false }),
  reportTableResult: vi.fn(),
  createSealedEventBattle: vi.fn(),
}))
vi.mock('./publishedTextFiles', () => ({
  publishedTextLocations: async () => ({ files: {}, holds: () => false, recordsHolding: () => [] }),
}))
vi.mock('./productActions', () => ({ productActions: { createSealedEventBattle } }))
vi.mock('./servedVsData', () => ({ servedVsDataSummaries: async () => null }))
vi.mock('./app', () => ({
  app: () => ({
    service: {
      sealedEventService: { sealedEvent },
      sealedEventResultsService: {
        reportTableResult,
        sealedEventResults,
        sealedEventBattles: async () => ({ battles: [], nextCursor: null }),
      },
    },
    telemetry: { posthog: { capture: vi.fn() } },
    rulesFor: async () => null,
    battleFactionsFor: async () => [],
  }),
}))

import { AgentTools } from './agentTools'
import { registerOrganisedPlayTools } from './organisedPlayTools'

const entry = (userId: string, extra: object = {}) => ({
  userId,
  name: userId,
  status: 'accepted',
  submitted: true,
  dropped: false,
  checkedIn: false,
  rosterName: null,
  army: null,
  armyFaction: null,
  teamId: null,
  squadId: null,
  requiredLimit: 2000,
  dispositionOwed: false,
  warlordOwed: false,
  team: null,
  ...extra,
})

const tournament = (extra: object = {}) => ({
  kind: 'tournament',
  token: 'cup',
  eventToken: 'cup',
  tournament: { name: 'Cup', description: '' },
  group: null,
  organizer: false,
  format: '1v1',
  rosterLimit: 2000,
  allowances: [],
  revealedAt: 1,
  rounds: 3,
  teams: null,
  squads: [],
  squadMatches: [],
  pointsBudget: null,
  soloPoints: null,
  allyPoints: null,
  sharedPoints: false,
  playsAt: null,
  sealBy: null,
  roundEndsAt: null,
  pairings: [{ key: 'r1t1', round: 1, table: 1, aId: 'opponent', bId: 'player-1', battleToken: null }],
  entries: [entry('player-1'), entry('opponent')],
  ...extra,
})

function call(name: string, input: object) {
  const tools = new AgentTools()
  registerOrganisedPlayTools(tools, 'player-1')
  return tools.execute(name, input)
}

it('shows no opponent’s list before the reveal, even when one is read', async () => {
  sealedEvent.mockResolvedValueOnce(
    tournament({
      revealedAt: null,
      pairings: [],
      entries: [entry('player-1'), entry('opponent', { rosterName: 'Secret list', army: { name: 'Secret list', detachments: [] } })],
    }),
  )
  const result = await call('get_my_event', { token: 'cup' })
  expect(JSON.stringify(result)).not.toContain('Secret list')
})

it('reports the score in the pairing’s seat order when the player sits second', async () => {
  sealedEvent.mockResolvedValueOnce(tournament())
  await call('report_table_result', { token: 'cup', yourScore: 80, opponentScore: 45 })
  expect(reportTableResult).toHaveBeenLastCalledWith('cup', 'cup', 1, 1, [45, 80], null, 'player-1', {
    expectedPlayers: ['opponent', 'player-1'],
  })
})

it('leaves reporting a table the player does not sit at to the organizer', async () => {
  sealedEvent.mockResolvedValueOnce(tournament({ pairings: [{ key: 'r1t1', round: 1, table: 1, aId: 'a', bId: 'b', battleToken: null }] }))
  await expect(call('report_table_result', { token: 'cup', yourScore: 80, opponentScore: 45 })).rejects.toMatchObject({ status: 404 })
})

it('starts the battle against the paired Swiss opponent when none is named', async () => {
  sealedEvent.mockResolvedValueOnce(tournament())
  createSealedEventBattle.mockResolvedValueOnce({ token: 'battle-1' })
  await call('start_event_battle', { token: 'cup' })
  expect(createSealedEventBattle).toHaveBeenLastCalledWith('player-1', expect.objectContaining({ opponentId: 'opponent' }))
})

it('passes a sealed league fixture key to the battle start service', async () => {
  createSealedEventBattle.mockResolvedValueOnce({ token: 'battle-1' })
  await call('start_event_battle', { token: 'sealed-lists', opponentId: 'opponent', fixtureKey: 'fixture-1' })
  expect(createSealedEventBattle).toHaveBeenLastCalledWith(
    'player-1',
    expect.objectContaining({ token: 'sealed-lists', opponentId: 'opponent', fixtureKey: 'fixture-1' }),
  )
})

it('finds an earlier Swiss table for an organizer who did not play it', async () => {
  sealedEvent.mockResolvedValueOnce(
    tournament({
      organizer: true,
      entries: [entry('alice'), entry('bob')],
      pairings: [
        { key: 'r1t1', round: 1, table: 1, aId: 'alice', bId: 'bob', battleToken: 'round-one' },
        { key: 'r2t1', round: 2, table: 1, aId: 'alice', bId: 'bob', battleToken: null },
      ],
    }),
  )
  sealedEventResults.mockResolvedValueOnce({
    rows: [],
    swiss: [],
    partial: false,
    battles: [
      {
        token: 'round-one',
        status: 'finished',
        playerDetails: [
          { id: 'alice', name: 'Alice' },
          { id: 'bob', name: 'Bob' },
        ],
        sides: [0, 1],
        scores: [74, 55],
      },
    ],
  })
  const result = await call('get_my_event', { token: 'cup', tableRound: 1 })
  expect(result.structuredContent).toMatchObject({
    rounds: { tables: [{ round: 1, battle: { token: 'round-one', status: 'finished', players: [{ score: 74 }, { score: 55 }] } }] },
  })
})

it('gives the organizer the sealed no-shows before the first round', async () => {
  sealedEvent.mockResolvedValueOnce(
    tournament({
      organizer: true,
      pairings: [],
      entries: [entry('checked-in', { checkedIn: true }), entry('unsealed', { submitted: false }), entry('no-show')],
    }),
  )
  const result = await call('get_my_event', { token: 'cup' })
  expect(result.structuredContent?.noShowIds).toEqual(['no-show'])
})

it('offers an organizer playing in a team meeting only their own team’s picks', async () => {
  sealedEvent.mockResolvedValueOnce(
    tournament({
      organizer: true,
      teams: { size: 3, scoring: 'games' },
      squads: [
        { id: 'red', name: 'Red', memberIds: ['player-1', 'a', 'b'] },
        { id: 'blue', name: 'Blue', memberIds: ['c', 'd', 'e'] },
      ],
      entries: [entry('player-1', { squadId: 'red' })],
      squadMatches: [{ aId: 'red', bId: 'blue', round: 1, table: 1, revealed: [], ready: [] }],
    }),
  )
  const result = await call('get_my_event', { token: 'cup' })
  expect(result.structuredContent).toMatchObject({ rounds: { meetings: [{ next: { options: [{ squadId: 'red' }] } }] } })
})
