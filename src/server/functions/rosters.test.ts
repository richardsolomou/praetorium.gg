import { beforeEach, expect, it, vi } from 'vitest'
import { ROSTER_DISCOVERY_PAGE_SIZE, type RosterDiscoveryFilter } from '../../core/rosterDiscovery'
import { discoverRosters } from './rosters'

const mocks = vi.hoisted(() => ({ factionIndexFor: vi.fn(), discover: vi.fn(), assessments: vi.fn() }))
vi.mock('@tanstack/react-start', () => {
  const builder = () => ({ validator: () => builder(), handler: (handler: unknown) => handler })
  return { createServerFn: builder }
})
vi.mock('../rpc', () => ({ rpc: (work: () => unknown) => work(), mutationRpc: (work: () => unknown) => work() }))
vi.mock('../app', () => ({ app: () => ({ factionIndexFor: mocks.factionIndexFor, service: { discoverRosters: mocks.discover } }) }))
vi.mock('../rosterPrices', () => ({ cachedRosterAssessmentsFor: mocks.assessments }))

type Discovered = { rosters: { roster: { id: string }; owner: { name: string }; points: number | null; problem: string | null }[] }
const invoke = discoverRosters as unknown as (input: { data: RosterDiscoveryFilter & { before: null } }) => Promise<Discovered>

const summary = (id: string, catalogueId: string) => ({ id, catalogueId, detachmentIds: ['awakened'], unitCount: 1 })
const entry = (id: string, catalogueId: string) => ({
  summary: summary(id, catalogueId),
  owner: { id: 'owner', name: 'Owner' },
  priceable: { id, picks: [{ entryId: 'warriors', note: 'Hold the left flank.' }] },
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.factionIndexFor.mockResolvedValue({
    factions: [
      { id: 'necrons', isDefault: true },
      { id: 'legacy~necrons', edition: { name: 'Old rules', status: 'retired' }, isDefault: false },
    ],
  })
  mocks.discover.mockResolvedValue({ rosters: [entry('current', 'necrons'), entry('archived', 'legacy~necrons')], nextCursor: null })
  mocks.assessments.mockImplementation(async (rosters: unknown[]) => rosters.map(() => ({ points: 990, verdict: { problem: null } })))
})

it('asks the product database for one bounded page of the rules versions in scope', async () => {
  await invoke({ data: { rules: 'archived', before: null } })
  expect(mocks.discover).toHaveBeenCalledWith({
    catalogueIds: ['legacy~necrons'],
    detachmentIds: null,
    before: null,
    limit: ROSTER_DISCOVERY_PAGE_SIZE,
  })
})

it('reads nothing when no rules version is in that state', async () => {
  expect((await invoke({ data: { rules: 'preview', before: null } })).rosters).toEqual([])
})

it('does not ask the product database when no rules version is in that state', async () => {
  await invoke({ data: { rules: 'preview', before: null } })
  expect(mocks.discover).not.toHaveBeenCalled()
})

it('leaves out a roster that reads as another rules version than the filter asks for', async () => {
  expect((await invoke({ data: { rules: 'current', before: null } })).rosters.map((found) => found.roster.id)).toEqual(['current'])
})

it("names each army's owner beside its points and legality", async () => {
  expect((await invoke({ data: { before: null } })).rosters[0]).toMatchObject({ owner: { name: 'Owner' }, points: 990, problem: null })
})

it('never sends unit notes to the reader', async () => {
  expect(JSON.stringify(await invoke({ data: { before: null } }))).not.toContain('Hold the left flank.')
})
