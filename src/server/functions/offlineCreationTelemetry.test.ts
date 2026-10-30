import { beforeEach, expect, it, vi } from 'vitest'
import { syncAction } from './offline'
import { offlineContext } from '../offlineContext'
import type { OfflineActionKind } from '../../contracts/offlineActions'

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  syncReceipt: vi.fn(),
  createBattle: vi.fn(),
  createTournament: vi.fn(),
  createLeagueBattle: vi.fn(),
  battleWorkspace: vi.fn(),
  applied: true,
  player: { id: 'actor', impersonatedBy: null as string | null },
}))
vi.mock('@tanstack/react-start', () => {
  const builder = () => ({ validator: () => builder(), handler: (handler: unknown) => handler })
  return { createServerFn: builder }
})
vi.mock('../rpc', () => ({ rpc: (work: () => unknown) => work(), mutationRpc: (work: () => unknown) => work() }))
vi.mock('../playerSession', () => ({ requireUser: async () => mocks.player }))
vi.mock('../app', () => ({
  app: () => ({ service: { ...mocks, leagueService: mocks }, telemetry: { capture: mocks.capture }, rulesFor: async () => null }),
}))

const cases = [
  {
    kind: 'createBattle' as const,
    method: 'createBattle' as const,
    input: { opponentIds: ['private-opponent', 'private-second'], allyId: 'private-ally', limit: 2000, casual: true },
    result: { battleId: 'battle-id', token: 'private-battle', practice: true },
    event: 'battle_created',
    properties: {
      delivery: 'sync',
      battle_id: 'battle-id',
      practice: true,
      limit: 2000,
      player_count: 4,
      casual: true,
      manual: false,
      guests: 0,
    },
  },
  {
    kind: 'createLeague' as const,
    method: 'createTournament' as const,
    input: { name: 'Private league', visibility: 'private', admission: 'approval', format: '2v2', rosterLimit: 2000, ownerPlays: true },
    result: { token: 'private-league', eventToken: 'private-event' },
    event: 'league_created',
    properties: { delivery: 'sync', visibility: 'private', admission: 'approval', format: '2v2', roster_limit: 2000, owner_plays: true },
  },
  {
    kind: 'createLeagueBattle' as const,
    method: 'createLeagueBattle' as const,
    input: { token: 'private-league', opponentId: 'private-opponent' },
    result: { battleId: 'battle-id', token: 'private-battle', format: '1v1', requiredLimit: 2000 },
    event: 'league_battle_created',
    properties: { delivery: 'sync', battle_id: 'battle-id', format: '1v1', required_limit: 2000 },
  },
]

const dataFor = (kind: OfflineActionKind, input: unknown) => ({
  owner: 'actor',
  operationId: crypto.randomUUID(),
  kind,
  input,
  createdAt: 100,
  identifiers: { battleToken: crypto.randomUUID() },
})
const invoke = syncAction as unknown as (args: { data: ReturnType<typeof dataFor> }) => Promise<unknown>

beforeEach(() => {
  vi.resetAllMocks()
  mocks.player.impersonatedBy = null
  mocks.applied = true
  mocks.syncReceipt.mockResolvedValueOnce(null).mockResolvedValue({ outcome: 'applied', message: '' })
  mocks.battleWorkspace.mockResolvedValue({ workspace: { serverSeq: 1 } })
  for (const { method, result } of cases)
    mocks[method].mockImplementation(async () => {
      offlineContext.getStore()!.applied = mocks.applied
      return result
    })
})

it.each(cases)('captures committed $kind without private contents', async ({ kind, input, event, properties }) => {
  await invoke({ data: dataFor(kind, input) })
  expect(mocks.capture.mock.calls).toEqual([['actor', event, properties]])
})

it.each(cases)('does not count a recovered $kind receipt twice', async ({ kind, input, event, properties }) => {
  const data = dataFor(kind, input)
  await invoke({ data })
  await invoke({ data })
  expect(mocks.capture.mock.calls).toEqual([['actor', event, properties]])
})

it.each(cases)('does not count $kind when a concurrent request applied it', async ({ kind, input }) => {
  mocks.applied = false
  await invoke({ data: dataFor(kind, input) })
  expect(mocks.capture).not.toHaveBeenCalled()
})

it.each(cases)('does not count a failed $kind write', async ({ kind, method, input }) => {
  mocks[method].mockRejectedValue(new Error('Database unavailable'))
  await invoke({ data: dataFor(kind, input) }).catch(() => {})
  expect(mocks.capture).not.toHaveBeenCalled()
})

it('does not repeat creation after acknowledgement hydration fails', async () => {
  mocks.battleWorkspace.mockRejectedValueOnce(new Response('Unavailable', { status: 503 }))
  const data = dataFor('createBattle', cases[0]!.input)
  await invoke({ data }).catch(() => {})
  await invoke({ data })
  expect(mocks.capture.mock.calls).toEqual([['actor', cases[0]!.event, cases[0]!.properties]])
})

it.each([{ owner: 'other' }, {}])('rejects an unauthorized creation before capture (%j)', async (override) => {
  if (!override.owner) mocks.player.impersonatedBy = 'admin'
  await invoke({ data: { ...dataFor('createBattle', cases[0]!.input), ...override } }).catch(() => {})
  expect([mocks.syncReceipt.mock.calls, mocks.capture.mock.calls]).toEqual([[], []])
})

it('reports a refused creation by its kind and status, without the message', async () => {
  mocks.createBattle.mockRejectedValue(new Response('Private refusal', { status: 409 }))
  await invoke({ data: dataFor('createBattle', cases[0]!.input) })
  expect(mocks.capture.mock.calls).toEqual([['actor', 'sync_refused', { kind: 'createBattle', outcome: 'refused', cause: 'http-409' }]])
})
