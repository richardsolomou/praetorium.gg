import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { sealedEventRosterFixture } from '../../server/sealedEventRoster.fixtures'
import { saveRosterSchema } from '../../contracts/schemas'
import { sealedEventBattleOptions, setPlayerDefaults, submitSealedEventRoster } from './actionFunctions'

const runtime = vi.hoisted(() => ({
  owner: 'alice',
  operations: [] as { id: string; status: string; message?: string }[],
  queue: vi.fn(),
  sync: vi.fn(),
  document: vi.fn(),
  construction: vi.fn(),
  client: undefined as { getQueryData: () => unknown } | undefined,
}))
vi.mock('./localRuntime', () => ({
  localOwner: () => ({ id: runtime.owner }),
  localEngine: () => ({ storage: { read: async () => ({ operations: runtime.operations }) } }),
  queueLocal: runtime.queue,
  attemptLocalSync: runtime.sync,
  localClient: () => runtime.client,
  localDocument: runtime.document,
  hasLocalChanges: () => true,
  rememberDocument: vi.fn(),
}))
vi.mock('./construction', () => ({ localConstruction: runtime.construction }))
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('navigator', { onLine: true })
  runtime.owner = 'alice'
  runtime.operations = [{ id: 'saved', status: 'pending' }]
  runtime.queue.mockResolvedValue({ id: 'saved' })
  runtime.sync.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
it('leaves ended group games out of the matchups offered offline', async () => {
  const game = (token: string, pastAt: number | null) => ({
    token,
    eventToken: token,
    personal: true,
    pastAt,
    revealedAt: 1,
    format: '1v1',
    tournament: null,
    group: { name: 'Group' },
    entries: ['alice', 'bob'].map((userId) => ({ userId, status: 'accepted', submitted: true })),
  })
  const games = [game('ended', 1), game('current', null)]
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: false })
  runtime.client = { getQueryData: () => games }
  runtime.document.mockImplementation(async (resource: string) => games.find(({ token }) => resource.endsWith(token)))
  const matches = await sealedEventBattleOptions({ data: { opponentIds: ['bob'] } })
  runtime.client = undefined
  expect(matches.map((match) => match.eventToken)).toEqual(['current'])
})

it('reports an authoritative refusal without discarding the saved action', async () => {
  runtime.operations[0] = { id: 'saved', status: 'refused', message: 'The account cannot change this setting.' }
  runtime.sync.mockResolvedValue(undefined)
  await expect(setPlayerDefaults({ data: { rosterVisibility: 'private', battleSize: 2000 } })).rejects.toThrow(
    'The account cannot change this setting.',
  )
})
it('rejects the result when the account changes while an action syncs', async () => {
  runtime.sync.mockImplementation(async () => {
    runtime.owner = 'bob'
  })
  await expect(setPlayerDefaults({ data: { rosterVisibility: 'private', battleSize: 2000 } })).rejects.toThrow(
    'The account changed while saving this action.',
  )
})

it.each(['preview', 'released', 'retired'] as const)('queues a saved %s sealed event roster for offline sealing', async (status) => {
  const { saved, catalogue, rules } = sealedEventRosterFixture(status)
  runtime.document.mockImplementation(async (resource: string) => (resource.startsWith('roster:') ? saved : { format: '1v1' }))
  runtime.construction.mockReturnValue({ catalogue, rules })
  runtime.queue.mockClear()
  vi.stubGlobal('navigator', { onLine: false })
  await submitSealedEventRoster({ data: { token: 'tournament', rosterId: saved.id } })
  expect(runtime.queue).toHaveBeenCalledWith(
    'submitSealedEventRoster',
    {
      input: {
        token: 'tournament',
        rosterId: saved.id,
        capturedRoster: saveRosterSchema.parse(saved),
        catalogueRevision: catalogue.index.revision,
      },
      identifiers: {},
    },
    'sealed-event:tournament',
    { dependencies: ['roster:roster'], owner: 'alice' },
  )
})

it('names the missing Warlord when a list without one is sealed on this device', async () => {
  const { saved, catalogue, rules } = sealedEventRosterFixture('released')
  const unled = { ...saved, picks: [{ ...saved.picks[0]!, toggles: {} }] }
  runtime.document.mockImplementation(async (resource: string) => (resource.startsWith('roster:') ? unled : { format: '1v1' }))
  runtime.construction.mockReturnValue({ catalogue, rules })
  vi.stubGlobal('navigator', { onLine: false })
  await expect(submitSealedEventRoster({ data: { token: 'tournament', rosterId: saved.id } })).rejects.toThrow(
    'Choose a Warlord: this list has none',
  )
})
