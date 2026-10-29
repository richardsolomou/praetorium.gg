import { beforeEach, expect, it, vi } from 'vitest'
import { saveRosterSchema } from '../../contracts/schemas'
import { syncRoster } from './offline'

const mocks = vi.hoisted(() => ({ capture: vi.fn(), syncRoster: vi.fn(), player: { id: 'actor', impersonatedBy: null as string | null } }))

vi.mock('@tanstack/react-start', () => {
  const builder = () => ({ validator: () => builder(), handler: (handler: unknown) => handler })
  return { createServerFn: builder }
})
vi.mock('../rpc', () => ({ rpc: (work: () => unknown) => work(), mutationRpc: (work: () => unknown) => work() }))
vi.mock('../playerSession', () => ({ requireUser: async () => mocks.player }))
vi.mock('../app', () => ({
  app: () => ({ service: mocks, telemetry: { capture: mocks.capture }, catalogueFor: async () => null, rulesFor: async () => null }),
}))

const input = () => ({
  owner: 'actor',
  operationId: crypto.randomUUID(),
  expectedVersion: null as number | null,
  deleted: false,
  roster: {
    ...saveRosterSchema.parse({
      name: 'Private army',
      catalogueId: 'cat',
      detachmentIds: [],
      disposition: null,
      limit: 2000,
      picks: [],
      prep: null,
    }),
    id: 'private-roster',
    baseRosterId: null as string | null,
    copiedFromRosterId: null as string | null,
  },
})
const invoke = syncRoster as unknown as (args: { data: ReturnType<typeof input> }) => Promise<unknown>

beforeEach(() => {
  vi.resetAllMocks()
  mocks.player.impersonatedBy = null
  mocks.syncRoster.mockResolvedValue({ outcome: 'applied', version: 1, deleted: false, lifecycle: 'created' })
})

it.each([
  [[], 0],
  [[{ entryId: 'squad' }], 1],
  [[{ entryId: 'squad' }, { entryId: 'leader', attachedTo: 0 }, { entryId: 'tank' }], 2],
])('counts fielded units on a confirmed synced creation (%j)', async (picks, count) => {
  const data = input()
  data.roster.picks = picks
  await invoke({ data })
  expect(mocks.capture.mock.calls).toEqual([
    ['actor', 'roster_created', { limit: 2000, unit_count: count, source: 'editable', visibility: 'private', delivery: 'sync' }],
  ])
})

it('captures a confirmed synced deletion without roster contents', async () => {
  mocks.syncRoster.mockResolvedValue({ outcome: 'applied', version: 2, deleted: true, lifecycle: 'deleted' })
  await invoke({ data: { ...input(), expectedVersion: 1, deleted: true } })
  expect(mocks.capture.mock.calls).toEqual([['actor', 'roster_deleted', { delivery: 'sync' }]])
})

it.each([
  [{ baseRosterId: 'base' }, true],
  [{ copiedFromRosterId: 'source' }, false],
])('preserves the copy or variant dimension for %j', async (copied, variant) => {
  const data = input()
  Object.assign(data.roster, copied)
  await invoke({ data })
  expect(mocks.capture.mock.calls).toEqual([
    ['actor', 'roster_created', { limit: 2000, unit_count: 0, source: 'editable', visibility: 'private', variant, delivery: 'sync' }],
  ])
})

it('does not repeat creation telemetry after a lost acknowledgement', async () => {
  mocks.syncRoster
    .mockResolvedValueOnce({ outcome: 'applied', version: 1, deleted: false, lifecycle: 'created' })
    .mockResolvedValueOnce({ outcome: 'applied', version: 1, deleted: false, lifecycle: null })
  const data = input()
  await invoke({ data })
  await invoke({ data })
  expect(mocks.capture.mock.calls).toEqual([
    ['actor', 'roster_created', { limit: 2000, unit_count: 0, source: 'editable', visibility: 'private', delivery: 'sync' }],
  ])
})

it.each([
  { outcome: 'applied', version: 2, deleted: false, lifecycle: null },
  { outcome: 'applied', version: 2, deleted: true, lifecycle: null },
])('does not capture a lifecycle event for %j', async (answer) => {
  mocks.syncRoster.mockResolvedValue(answer)
  await invoke({ data: input() })
  expect(mocks.capture).not.toHaveBeenCalled()
})

it.each(['conflict', 'refused'] as const)('reports a %s sync without its message', async (outcome) => {
  mocks.syncRoster.mockResolvedValue({ outcome, message: 'Changed elsewhere' })
  await invoke({ data: input() })
  expect(mocks.capture.mock.calls).toEqual([['actor', 'sync_refused', { kind: 'roster', outcome }]])
})

it('does not capture a creation before the database confirms it', async () => {
  mocks.syncRoster.mockRejectedValue(new Error('Database unavailable'))
  await invoke({ data: input() }).catch(() => {})
  expect(mocks.capture).not.toHaveBeenCalled()
})

it.each([{ owner: 'another-account' }, {}])('rejects unauthorized sync before touching product state (%j)', async (override) => {
  if (!override.owner) mocks.player.impersonatedBy = 'admin'
  await invoke({ data: { ...input(), ...override } }).catch(() => {})
  expect([mocks.syncRoster.mock.calls, mocks.capture.mock.calls]).toEqual([[], []])
})
