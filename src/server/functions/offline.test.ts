import { beforeEach, expect, it, vi } from 'vitest'
import { syncAction, syncBattleCommand } from './offline'
import { builtRoster } from '../../core/battle.fixtures'
import { bookOf, points } from '../catalogue.fixtures'
import { saveRosterSchema } from '../../contracts/schemas'
import { emptyLocalState } from '../../contracts/localState'
import { SyncEngine } from '../../client/offline/syncEngine'

const mocks = vi.hoisted(() => ({
  user: { id: 'actor', impersonatedBy: null as string | null },
  hasBattleOperation: vi.fn(),
  ownRoster: vi.fn(),
  submit: vi.fn(),
  battleWorkspace: vi.fn(),
  catalogueFor: vi.fn(),
  catalogue: vi.fn(),
  rulesFor: vi.fn(),
  syncReceipt: vi.fn(),
  createAction: vi.fn(),
}))
vi.mock('@tanstack/react-start', () => {
  const builder = () => ({ validator: () => builder(), handler: (handler: unknown) => handler })
  return { createServerFn: builder }
})

const invokeAction = syncAction as unknown as (input: { data: Parameters<typeof syncAction>[0]['data'] }) => ReturnType<typeof syncAction>
function creation(kind: 'createBattle' | 'createLeagueBattle') {
  return {
    owner: 'actor',
    operationId: crypto.randomUUID(),
    kind,
    input: {},
    createdAt: 100,
    identifiers: { battleToken: crypto.randomUUID() },
  }
}
it.each(['createBattle', 'createLeagueBattle'] as const)(
  'retains a deleted %s after recovering its applied receipt and continues unrelated work',
  async (kind) => {
    mocks.syncReceipt.mockResolvedValue({ outcome: 'applied', message: '' })
    mocks.battleWorkspace.mockRejectedValue(new Response('Battle deleted', { status: 404 }))
    let state = emptyLocalState('actor')
    const data = creation(kind)
    const engine = new SyncEngine(
      { read: async () => state, change: async (update) => (state = update(state)) },
      async (operation) => {
        if (operation.kind === 'saveRoster') return { outcome: 'applied', data: 'Saved roster' }
        const answer = await invokeAction({ data })
        return answer.outcome === 'applied' ? { outcome: 'applied', data: null } : { outcome: 'refused', message: answer.message }
      },
      () => {},
    )
    await engine.enqueue(
      { id: data.operationId, kind, resource: 'battle:created', input: {}, createdAt: 100, status: 'pending' },
      { log: ['Played history'] },
    )
    await engine.enqueue({
      id: crypto.randomUUID(),
      kind: 'saveRoster',
      resource: 'roster:army',
      input: {},
      createdAt: 101,
      status: 'pending',
    })
    await engine.sync()
    expect({
      retained: state.operations.map((operation) => ({ kind: operation.kind, status: operation.status })),
      battle: state.documents['battle:created']?.data,
      roster: state.documents['roster:army']?.data,
    }).toEqual({ retained: [{ kind, status: 'refused' }], battle: { log: ['Played history'] }, roster: 'Saved roster' })
  },
)
it.each([403, 409])('retains an inaccessible or oversized created battle for review (HTTP %s)', async (status) => {
  mocks.syncReceipt.mockResolvedValue({ outcome: 'applied', message: '' })
  mocks.battleWorkspace.mockRejectedValue(new Response('Battle unavailable', { status }))
  expect(await invokeAction({ data: creation('createBattle') })).toEqual({ outcome: 'refused', message: 'Battle unavailable' })
})
it.each([401, 429, 503])('retries creation acknowledgement hydration after HTTP %s', async (status) => {
  mocks.syncReceipt.mockResolvedValue({ outcome: 'applied', message: '' })
  mocks.battleWorkspace.mockRejectedValue(new Response('Try later', { status }))
  await expect(invokeAction({ data: creation('createBattle') })).rejects.toMatchObject({ status })
})
it('returns the workspace when recovering an accepted battle creation', async () => {
  mocks.syncReceipt.mockResolvedValue({ outcome: 'applied', message: '' })
  expect(await invokeAction({ data: creation('createBattle') })).toEqual({
    outcome: 'applied',
    message: '',
    workspace: { serverSeq: 2 },
    version: 2,
  })
})
it('hydrates a battle immediately after its creation commits a receipt', async () => {
  mocks.syncReceipt.mockResolvedValueOnce(null).mockResolvedValueOnce({ outcome: 'applied', message: '' })
  expect(await invokeAction({ data: creation('createBattle') })).toEqual({
    outcome: 'applied',
    message: '',
    workspace: { serverSeq: 2 },
    version: 2,
  })
})
vi.mock('../offlineActions', () => ({ offlineActions: { createBattle: mocks.createAction, createLeagueBattle: mocks.createAction } }))
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

const invoke = syncBattleCommand as unknown as (input: {
  data: Parameters<typeof syncBattleCommand>[0]['data']
}) => ReturnType<typeof syncBattleCommand>
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

it.each([403, 404])('retains an unavailable battle as a refusal (HTTP %s)', async (status) => {
  mocks.hasBattleOperation.mockRejectedValue(new Response('Battle unavailable', { status }))
  expect(await invoke({ data: input() })).toEqual({ outcome: 'refused', message: 'Battle unavailable' })
})

it.each([401, 429, 503])('keeps temporary battle sync failures pending (HTTP %s)', async (status) => {
  mocks.hasBattleOperation.mockRejectedValue(new Response('Try later', { status }))
  await expect(invoke({ data: input() })).rejects.toMatchObject({ status })
})

it('retains a battle deleted between validation and append as a refusal', async () => {
  mocks.hasBattleOperation.mockResolvedValue(true)
  mocks.submit.mockRejectedValue(new Response('Battle deleted', { status: 404 }))
  expect(await invoke({ data: input() })).toEqual({ outcome: 'refused', message: 'Battle deleted' })
})

it('retains a battle deleted before the acknowledgement read as a refusal', async () => {
  mocks.hasBattleOperation.mockResolvedValue(true)
  mocks.battleWorkspace.mockRejectedValue(new Response('Battle deleted', { status: 404 }))
  expect(await invoke({ data: input() })).toEqual({ outcome: 'refused', message: 'Battle deleted' })
})

it('syncs an unrelated roster after retaining a deleted battle command for review', async () => {
  mocks.hasBattleOperation.mockRejectedValue(new Response('Battle deleted', { status: 404 }))
  let state = emptyLocalState('actor')
  const data = input()
  const engine = new SyncEngine(
    { read: async () => state, change: async (update) => (state = update(state)) },
    async (operation) => {
      if (operation.kind !== 'battleCommand') return { outcome: 'applied', data: { name: 'Saved army' } }
      const answer = await invoke({ data })
      return answer.outcome === 'applied' ? { outcome: 'applied', data: answer.workspace, serverVersion: answer.version } : answer
    },
    () => {},
  )
  await engine.enqueue({
    id: data.operationId,
    resource: 'battle:battle',
    kind: 'battleCommand',
    input: {},
    createdAt: 1,
    status: 'pending',
  })
  await engine.enqueue({ id: crypto.randomUUID(), resource: 'roster:army', kind: 'saveRoster', input: {}, createdAt: 2, status: 'pending' })
  await engine.sync()
  expect({
    retained: state.operations.map((operation) => ({ resource: operation.resource, status: operation.status })),
    roster: state.documents['roster:army']?.data,
  }).toEqual({ retained: [{ resource: 'battle:battle', status: 'refused' }], roster: { name: 'Saved army' } })
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
