import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { bookOf, points } from '../../server/catalogue.fixtures'
import { saveRosterSchema } from '../../contracts/schemas'
import type { BattleWorkspace } from '../../contracts/battleWorkspace'
import { submit } from './battleFunctions'
import { ALICE, log, started, turns } from '../../core/battle.fixtures'

const mocks = vi.hoisted(() => ({
  construction: vi.fn(),
  document: vi.fn(),
  queue: vi.fn(),
  workspace: vi.fn(),
  submit: vi.fn(),
  changes: vi.fn(),
}))
vi.mock('../../server/functions', () => ({ submit: mocks.submit }))
vi.mock('../../server/functions/offline', () => ({ battleWorkspace: mocks.workspace }))
vi.mock('./construction', () => ({ localConstruction: mocks.construction }))
vi.mock('./localRuntime', () => ({
  localEngine: () => ({ storage: { read: async () => ({ operations: [] }) } }),
  localOwner: () => ({ id: 'alice' }),
  localDocument: mocks.document,
  queueLocal: mocks.queue,
  localClient: vi.fn(),
  hasLocalChanges: mocks.changes,
  rememberBattle: vi.fn(),
  rememberDocument: vi.fn(),
  syncLocalWork: vi.fn(),
}))

const workspace: BattleWorkspace = {
  battle: { id: 'battle', token: 'battle', createdAt: 0 },
  players: [
    { id: 'alice', name: 'Alice', side: 0, automated: false },
    { id: 'bob', name: 'Bob', side: 1, automated: true },
  ],
  log: [],
  serverSeq: 0,
  serverNow: 0,
}

function prepare(cost: number, copies = 1) {
  const catalogue = bookOf({
    selectionEntries: [
      {
        id: 'lord',
        name: 'Unit',
        type: 'model',
        costs: points(cost),
        constraints: [{ id: 'lord-max', type: 'max', value: 1, field: 'selections', scope: 'force', includeChildSelections: true }],
      },
    ],
  })
  const roster = saveRosterSchema.parse({
    id: 'roster',
    name: 'Army',
    catalogueId: 'cat',
    detachmentIds: [],
    disposition: null,
    limit: 1_000,
    picks: Array.from({ length: copies }, () => ({ entryId: 'lord' })),
    waivedRules: [],
    optionalRules: [],
    prep: null,
  })
  mocks.construction.mockReturnValue({
    revision: catalogue.index.revision,
    catalogue,
    rules: {
      factionKeys: new Map(),
      detachmentReferences: new Map(),
      detachmentDetails: new Map(),
      factionRestrictions: new Map(),
      missions: new Map(),
      deployments: [],
    },
  })
  mocks.document.mockImplementation(async (resource: string) => (resource === 'battle:battle' ? workspace : roster))
}

const attach = () => submit({ data: { token: 'battle', expectedSeq: 0, command: { kind: 'attach-saved-roster', rosterId: 'roster' } } })
beforeEach(() => vi.resetAllMocks())
afterEach(() => vi.unstubAllGlobals())

it('freezes an offline roster from real pricing and records the validation revision before sync', async () => {
  prepare(80)
  await attach()
  expect(mocks.queue.mock.calls[0]?.[1]).toMatchObject({
    catalogueRevision: 'test-revision',
    command: { kind: 'attach-roster', roster: { built: { revision: 'test-revision', units: [{ points: 80 }] } } },
    capturedRoster: { id: 'roster', picks: [{ entryId: 'lord' }] },
  })
})

it('refuses an over-points roster offline before saving a battle command', async () => {
  prepare(1_001)
  await expect(attach()).rejects.toThrow('roster has 1001 points, over its 1000-point limit')
  expect(mocks.queue).not.toHaveBeenCalled()
})

it('refuses a force-wide unit limit violation offline before saving a battle command', async () => {
  prepare(80, 2)
  await expect(attach()).rejects.toThrow('allows at most 1, has 2')
  expect(mocks.queue).not.toHaveBeenCalled()
})

it('refreshes a saved workspace that is older than the battle screen before returning a stale response', async () => {
  prepare(80)
  vi.stubGlobal('navigator', { onLine: true })
  const history = log(...started())
  const fresh = { ...workspace, log: history, serverSeq: history.length }
  mocks.workspace.mockResolvedValue({ workspace: fresh })
  mocks.document.mockResolvedValueOnce(workspace).mockResolvedValueOnce(fresh)
  const answer = await submit({ data: { token: 'battle', expectedSeq: 1, command: { kind: 'attach-saved-roster', rosterId: 'roster' } } })
  expect(answer.result).toEqual({ outcome: 'stale', seq: history.length })
})

it('keeps the newer battle screen when its full history has not downloaded offline', async () => {
  prepare(80)
  vi.stubGlobal('navigator', { onLine: false })
  await expect(
    submit({ data: { token: 'battle', expectedSeq: 1, command: { kind: 'attach-saved-roster', rosterId: 'roster' } } }),
  ).rejects.toThrow('Reconnect to download the latest battle history before continuing.')
})

function settlement() {
  prepare(80)
  const history = log(...started(), ...turns(6, ALICE))
  mocks.document.mockResolvedValue({ ...workspace, log: history, serverSeq: history.length })
  return { data: { token: 'battle', expectedSeq: history.length, command: { kind: 'settle-opponent-turn' as const } } }
}

it('returns a competing connected automatic settlement as stale without saving a durable conflict', async () => {
  const input = settlement()
  vi.stubGlobal('navigator', { onLine: true })
  const authoritative = { result: { outcome: 'stale', seq: input.data.expectedSeq + 1 }, screen: null }
  mocks.submit.mockResolvedValue(authoritative)
  const result = await submit(input, { background: true })
  expect({ result, queued: mocks.queue.mock.calls }).toEqual({ result: authoritative, queued: [] })
})

it('saves an offline automatic settlement durably', async () => {
  const input = settlement()
  vi.stubGlobal('navigator', { onLine: false })
  await submit(input, { background: true })
  expect(mocks.queue.mock.calls[0]?.[1]).toMatchObject({ expectedSeq: input.data.expectedSeq, command: input.data.command })
})

it('keeps automatic settlement behind existing local battle work while connected', async () => {
  const input = settlement()
  vi.stubGlobal('navigator', { onLine: true })
  mocks.changes.mockResolvedValue(true)
  await submit(input, { background: true })
  expect(mocks.queue.mock.calls[0]?.[1]).toMatchObject({ expectedSeq: input.data.expectedSeq, command: input.data.command })
})

it('saves a player’s connected settlement durably', async () => {
  const input = settlement()
  vi.stubGlobal('navigator', { onLine: true })
  await submit(input)
  expect(mocks.queue.mock.calls[0]?.[1]).toMatchObject({ expectedSeq: input.data.expectedSeq, command: input.data.command })
})

it('does not replay a connected automatic write after an uncertain network response', async () => {
  const input = settlement()
  vi.stubGlobal('navigator', { onLine: true })
  mocks.submit.mockRejectedValue(new Error('Response lost'))
  await expect(submit(input, { background: true })).rejects.toThrow('Response lost')
  expect(mocks.queue).not.toHaveBeenCalled()
})
