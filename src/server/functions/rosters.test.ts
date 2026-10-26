import { beforeEach, expect, it, vi } from 'vitest'
import { ROSTER_DISCOVERY_PAGE_SIZE, type RosterAudience, type RosterDiscoveryFilter } from '../../core/rosterDiscovery'
import type { RosterSort } from '../../core/rosterSort'
import { discoverRosters, rosterAccess, rostersLentToMe } from './rosters'

const mocks = vi.hoisted(() => ({
  factionIndexFor: vi.fn(),
  factionFor: vi.fn(),
  discover: vi.fn(),
  lent: vi.fn(),
  access: vi.fn(),
  assessments: vi.fn(),
  viewerId: null as string | null,
}))
vi.mock('@tanstack/react-start', () => {
  const builder = () => ({ validator: () => builder(), handler: (handler: unknown) => handler })
  return { createServerFn: builder }
})
vi.mock('../rpc', () => ({ rpc: (work: () => unknown) => work(), mutationRpc: (work: () => unknown) => work() }))
vi.mock('../app', () => ({
  app: () => ({
    factionIndexFor: mocks.factionIndexFor,
    factionFor: mocks.factionFor,
    service: {
      rosterService: {
        discoverRosters: mocks.discover,
        rostersLentTo: mocks.lent,
        rosterAccess: mocks.access,
        copySource: async () => null,
      },
    },
  }),
}))
vi.mock('../playerSession', () => ({
  currentUserId: async () => mocks.viewerId,
  forSignedIn: async (signedOut: unknown, work: (userId: string) => unknown) => (mocks.viewerId ? work(mocks.viewerId) : signedOut),
}))
vi.mock('../rosterPrices', () => ({ cachedRosterAssessmentsFor: mocks.assessments }))

type Discovered = { rosters: { roster: { id: string }; owner: { name: string }; points: number | null; problem: string | null }[] }
const discover = discoverRosters as unknown as (input: {
  data: RosterDiscoveryFilter & { audience: RosterAudience; sort: RosterSort; before: null }
}) => Promise<Discovered>
const invoke = ({ data }: { data: RosterDiscoveryFilter & { audience?: RosterAudience; sort?: RosterSort; before: null } }) =>
  discover({ data: { audience: 'public', sort: 'updated-desc', ...data } })

const summary = (id: string, catalogueId: string) => ({ id, catalogueId, detachmentIds: ['awakened'], unitCount: 1 })
const entry = (id: string, catalogueId: string) => ({
  summary: summary(id, catalogueId),
  owner: { id: 'owner', name: 'Owner' },
  priceable: { id, picks: [{ entryId: 'warriors', note: 'Hold the left flank.' }] },
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.viewerId = null
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
    audience: 'public',
    viewerId: null,
    sort: 'updated-desc',
    catalogueIds: ['legacy~necrons'],
    detachmentIds: null,
    before: null,
    limit: ROSTER_DISCOVERY_PAGE_SIZE,
  })
})

it("asks for a signed-in player's friends' rosters as that player", async () => {
  mocks.viewerId = 'viewer'
  await invoke({ data: { audience: 'friends', before: null } })
  expect(mocks.discover).toHaveBeenCalledWith(expect.objectContaining({ audience: 'friends', viewerId: 'viewer' }))
})

it("does not ask for friends' rosters when nobody is signed in", async () => {
  await invoke({ data: { audience: 'friends', before: null } })
  expect(mocks.discover).not.toHaveBeenCalled()
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

it('opens a roster saved on an exact root book the faction index does not list', async () => {
  mocks.access.mockResolvedValue({ roster: { id: 'roster', catalogueId: 'necrons-root' }, editable: false })
  mocks.factionFor.mockImplementation(async (id: string) => (id === 'necrons-root' ? { id, name: 'Necrons' } : null))
  const read = rosterAccess as unknown as (input: { data: { id: string } }) => Promise<{ faction: { name: string } | null }>
  expect((await read({ data: { id: 'roster' } })).faction?.name).toBe('Necrons')
})

it('prices a lent roster for its card without sending its unit notes', async () => {
  mocks.viewerId = 'borrower'
  mocks.lent.mockResolvedValue([{ ...entry('lent', 'necrons'), lentAt: 1 }])
  const lent = JSON.stringify(await (rostersLentToMe as unknown as () => Promise<unknown>)())
  expect([lent.includes('"points":990'), lent.includes('Hold the left flank.')]).toEqual([true, false])
})
