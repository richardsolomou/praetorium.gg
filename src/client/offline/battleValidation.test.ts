import { beforeEach, expect, it, vi } from 'vitest'
import { bookOf, points } from '../../server/catalogue.fixtures'
import { saveRosterSchema } from '../../contracts/schemas'
import type { BattleWorkspace } from '../../contracts/battleWorkspace'
import { submit } from './battleFunctions'

const mocks = vi.hoisted(() => ({ construction: vi.fn(), document: vi.fn(), queue: vi.fn() }))
vi.mock('./construction', () => ({ localConstruction: mocks.construction }))
vi.mock('./localRuntime', () => ({
  localEngine: () => ({ storage: { read: async () => ({ operations: [] }) } }),
  localOwner: () => ({ id: 'alice' }),
  localDocument: mocks.document,
  queueLocal: mocks.queue,
  localClient: vi.fn(),
  hasLocalChanges: vi.fn(),
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
