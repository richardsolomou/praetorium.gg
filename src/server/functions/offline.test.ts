import { beforeEach, expect, it, vi } from 'vitest'
import { syncBattleCommand } from './offline'
import { builtRoster } from '../../core/battle.fixtures'
import { bookOf, points } from '../catalogue.fixtures'
import { saveRosterSchema } from '../../contracts/schemas'

const mocks = vi.hoisted(() => ({
  user: { id: 'actor', impersonatedBy: null as string | null },
  hasBattleOperation: vi.fn(),
  ownRoster: vi.fn(),
  submit: vi.fn(),
  battleWorkspace: vi.fn(),
  catalogueFor: vi.fn(),
  catalogue: vi.fn(),
  rulesFor: vi.fn(),
}))
vi.mock('@tanstack/react-start', () => {
  const builder = () => ({ validator: () => builder(), handler: (handler: unknown) => handler })
  return { createServerFn: builder }
})
vi.mock('../rpc', () => ({ rpc: (work: () => unknown) => work(), mutationRpc: (work: () => unknown) => work() }))
vi.mock('../playerSession', () => ({ requireUser: async () => mocks.user }))
vi.mock('../app', () => ({
  app: () => ({
    service: mocks,
    catalogueFor: mocks.catalogueFor,
    catalogue: mocks.catalogue,
    rulesFor: mocks.rulesFor,
    battleReadRulesFor: async () => null,
  }),
}))

const invoke = syncBattleCommand as unknown as (input: { data: Parameters<typeof syncBattleCommand>[0]['data'] }) => Promise<unknown>
function input() {
  const command = builtRoster('Saved army', ['Immortals'])
  if (command.kind !== 'attach-roster') throw new Error('Expected a roster fixture')
  return {
    owner: 'actor',
    operationId: crypto.randomUUID(),
    token: 'battle',
    expectedSeq: 1,
    recordedAt: 100,
    catalogueRevision: 'rev',
    command: { ...command, roster: { ...command.roster, id: 'roster' } },
  }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.user = { id: 'actor', impersonatedBy: null }
  mocks.hasBattleOperation.mockResolvedValue(false)
  mocks.submit.mockResolvedValue({ result: { outcome: 'appended', seq: 2 } })
  mocks.battleWorkspace.mockResolvedValue({ workspace: { serverSeq: 2 } })
  mocks.catalogue.mockReturnValue({ index: { revision: 'rev' } })
  mocks.rulesFor.mockResolvedValue({})
})

it('retries an accepted captured roster after its source was deleted without recapturing it', async () => {
  mocks.hasBattleOperation.mockResolvedValue(true)
  const data = input()
  const result = await invoke({ data })
  expect({
    result,
    recaptured: mocks.ownRoster.mock.calls.length + mocks.catalogueFor.mock.calls.length,
    command: mocks.submit.mock.calls[0]?.[3],
  }).toEqual({ result: { outcome: 'applied', workspace: { serverSeq: 2 }, version: 2 }, recaptured: 0, command: data.command })
})
it('refuses a new captured roster attachment when the ownership evidence is missing', async () => {
  const result = await invoke({ data: input() })
  expect({ result, writes: mocks.submit.mock.calls.length }).toEqual({
    result: { outcome: 'refused', message: 'You do not own the captured roster.' },
    writes: 0,
  })
})
it('rejects a saved command from another account before accessing the battle', async () => {
  await expect(invoke({ data: { ...input(), owner: 'another-account' } })).rejects.toMatchObject({ status: 401 })
  expect(mocks.hasBattleOperation).not.toHaveBeenCalled()
})
it('rejects impersonated saved commands before accessing the battle', async () => {
  mocks.user.impersonatedBy = 'administrator'
  await expect(invoke({ data: input() })).rejects.toMatchObject({ status: 401 })
  expect(mocks.hasBattleOperation).not.toHaveBeenCalled()
})
it('retains a stale local battle branch as a conflict instead of claiming an acknowledgement', async () => {
  mocks.hasBattleOperation.mockResolvedValue(true)
  mocks.submit.mockResolvedValue({ result: { outcome: 'stale', seq: 3 } })
  const result = await invoke({ data: input() })
  expect({ result, reads: mocks.battleWorkspace.mock.calls.length }).toEqual({
    result: {
      outcome: 'conflict',
      message: 'Another device advanced this battle. Your offline history is saved; review both histories before continuing.',
    },
    reads: 0,
  })
})

it('records the version of the downloaded workspace when another command arrived after acknowledgement', async () => {
  mocks.hasBattleOperation.mockResolvedValue(true)
  mocks.battleWorkspace.mockResolvedValue({ workspace: { serverSeq: 5 } })
  expect(await invoke({ data: input() })).toEqual({ outcome: 'applied', workspace: { serverSeq: 5 }, version: 5 })
})

it('retains offline scoring for review when the downloaded rules changed before sync', async () => {
  mocks.catalogue.mockReturnValue({ index: { revision: 'updated-rules' } })
  const result = await invoke({ data: { ...input(), command: { kind: 'score', category: 'primary', delta: 5 } } })
  expect({ result, writes: mocks.submit.mock.calls.length }).toEqual({
    result: {
      outcome: 'conflict',
      message: 'Army or game rules changed while you were offline. Your battle history is saved on this device; review it before syncing.',
    },
    writes: 0,
  })
})

it('keeps a new offline command pending when authoritative rules are unavailable', async () => {
  mocks.rulesFor.mockResolvedValue(null)
  await expect(invoke({ data: { ...input(), command: { kind: 'score', category: 'primary', delta: 5 } } })).rejects.toMatchObject({
    status: 503,
  })
  expect(mocks.submit).not.toHaveBeenCalled()
})

it('keeps a new offline command pending when the authoritative catalogue is unavailable', async () => {
  mocks.catalogue.mockReturnValue(null)
  await expect(invoke({ data: { ...input(), command: { kind: 'score', category: 'primary', delta: 5 } } })).rejects.toMatchObject({
    status: 503,
  })
  expect(mocks.submit).not.toHaveBeenCalled()
})

it('acknowledges an accepted command after a rules update without replaying its validation', async () => {
  mocks.hasBattleOperation.mockResolvedValue(true)
  mocks.catalogue.mockReturnValue({ index: { revision: 'updated-rules' } })
  mocks.rulesFor.mockResolvedValue(null)
  expect(await invoke({ data: { ...input(), command: { kind: 'score', category: 'primary', delta: 5 } } })).toEqual({
    outcome: 'applied',
    workspace: { serverSeq: 2 },
    version: 2,
  })
})

it('rejects an over-points captured roster even when its submitted snapshot claims cheaper units', async () => {
  const catalogue = bookOf({ selectionEntries: [{ id: 'unit', name: 'Unit', type: 'model', costs: points(1_001) }] })
  mocks.catalogue.mockReturnValue(catalogue)
  mocks.catalogueFor.mockResolvedValue(catalogue)
  mocks.ownRoster.mockResolvedValue({ id: 'roster' })
  mocks.rulesFor.mockResolvedValue({
    factionKeys: new Map(),
    detachmentReferences: new Map(),
    detachmentDetails: new Map(),
    factionRestrictions: new Map(),
  })
  const data = input()
  data.catalogueRevision = catalogue.index.revision
  data.command.roster.built!.revision = catalogue.index.revision
  const capturedRoster = {
    ...saveRosterSchema.parse({
      id: 'roster',
      name: 'Army',
      catalogueId: 'cat',
      detachmentIds: [],
      disposition: null,
      limit: 1_000,
      picks: [{ entryId: 'unit' }],
      prep: null,
    }),
    id: 'roster',
  }
  expect({ result: await invoke({ data: { ...data, capturedRoster } }), writes: mocks.submit.mock.calls.length }).toEqual({
    result: { outcome: 'refused', message: 'roster has 1001 points, over its 1000-point limit' },
    writes: 0,
  })
})
