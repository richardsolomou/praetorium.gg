import { describe, expect, it } from 'vitest'
import { ROSTER_DISCOVERY_MAX_PAGE_SIZE, discoveryPage, rosterDiscoveryQuerySchema, type RosterDiscoveryQuery } from './rosterDiscovery'
import { discoveryScope, inDiscoveryScope } from './rosterDiscoveryScope'

type Row = { id: string; userId: string; visibility: string; catalogueId: string; detachmentId: string | null; updatedAt: number }

const row = (id: string, updatedAt: number, overrides: Partial<Row> = {}): Row => ({
  id,
  userId: 'owner',
  visibility: 'public',
  catalogueId: 'necrons',
  detachmentId: '["awakened"]',
  updatedAt,
  ...overrides,
})
const query = (overrides: Partial<RosterDiscoveryQuery> = {}): RosterDiscoveryQuery => ({
  audience: 'public',
  viewerId: null,
  catalogueIds: null,
  detachmentIds: null,
  before: null,
  limit: 10,
  ...overrides,
})
const ids = (rows: Iterable<Row>, overrides: Partial<RosterDiscoveryQuery> = {}, friendIds?: ReadonlySet<string>) =>
  discoveryPage(rows, query(overrides), friendIds).rows.map((r) => r.id)

const ultramarines = { retired: 'a603-5039-f08d-e841', current: '4029-9237-e8db-af55' }
const factions = [
  { id: 'necrons', isDefault: true },
  { id: 'legacy~necrons', edition: { name: 'Old rules', status: 'retired' as const }, isDefault: false },
  { id: 'preview~necrons', edition: { name: 'Next rules', status: 'preview' as const }, isDefault: false },
  { id: ultramarines.current, isDefault: true },
]
const indexed = new Map(factions.map((faction) => [faction.id, faction]))

describe('roster discovery eligibility', () => {
  it('lists a public roster', () => {
    expect(ids([row('public', 1)])).toEqual(['public'])
  })

  it('leaves out a private roster', () => {
    expect(ids([row('private', 1, { visibility: 'private' })])).toEqual([])
  })

  it('leaves out an unlisted roster', () => {
    expect(ids([row('unlisted', 1, { visibility: 'unlisted' })])).toEqual([])
  })
})

describe('roster discovery audiences', () => {
  it("leaves the viewer's own roster out of the public audience", () => {
    expect(ids([row('own', 2, { userId: 'viewer' }), row('other', 1)], { viewerId: 'viewer' })).toEqual(['other'])
  })

  it("keeps a friend's public roster in the friends audience", () => {
    expect(ids([row('friend', 1, { userId: 'friend' })], { audience: 'friends', viewerId: 'viewer' }, new Set(['friend']))).toEqual([
      'friend',
    ])
  })

  it("leaves a stranger's roster out of the friends audience", () => {
    expect(ids([row('stranger', 1)], { audience: 'friends', viewerId: 'viewer' }, new Set(['friend']))).toEqual([])
  })

  it("leaves a friend's unlisted roster out of the friends audience", () => {
    expect(
      ids(
        [row('unlisted', 1, { userId: 'friend', visibility: 'unlisted' })],
        { audience: 'friends', viewerId: 'viewer' },
        new Set(['friend']),
      ),
    ).toEqual([])
  })
})

describe('roster discovery filters', () => {
  it('keeps rosters saved under the requested books', () => {
    expect(ids([row('necrons', 2), row('marines', 1, { catalogueId: 'marines' })], { catalogueIds: ['marines'] })).toEqual(['marines'])
  })

  it('keeps rosters holding a requested detachment', () => {
    expect(
      ids([row('awakened', 2), row('hypercrypt', 1, { detachmentId: '["awakened","hypercrypt"]' })], { detachmentIds: ['hypercrypt'] }),
    ).toEqual(['hypercrypt'])
  })

  it('reads a detachment saved before rosters held several', () => {
    expect(ids([row('legacy', 1, { detachmentId: 'hypercrypt' })], { detachmentIds: ['hypercrypt'] })).toEqual(['legacy'])
  })

  it('leaves out a roster without a detachment when one is requested', () => {
    expect(ids([row('none', 1, { detachmentId: null })], { detachmentIds: ['awakened'] })).toEqual([])
  })
})

describe('roster discovery pages', () => {
  it('lists the most recently saved roster first', () => {
    expect(ids([row('older', 1), row('newest', 3), row('newer', 2)])).toEqual(['newest', 'newer', 'older'])
  })

  it('holds no more than the page size', () => {
    expect(ids([row('a', 1), row('b', 2), row('c', 3)], { limit: 2 })).toEqual(['c', 'b'])
  })

  it('points the next page after the last roster shown', () => {
    expect(discoveryPage([row('a', 1), row('b', 2), row('c', 3)], query({ limit: 2 })).nextCursor).toEqual({ at: 2, id: 'b' })
  })

  it('has no next page when the last roster fits', () => {
    expect(discoveryPage([row('a', 1), row('b', 2)], query({ limit: 2 })).nextCursor).toBeNull()
  })

  it('continues from the cursor without repeating or skipping rosters saved at the same moment', () => {
    const rows = [row('a', 5), row('b', 5), row('c', 5), row('d', 4)]
    const first = discoveryPage(rows, query({ limit: 2 }))
    expect([...first.rows.map((r) => r.id), ...ids(rows, { limit: 2, before: first.nextCursor })]).toEqual(['c', 'b', 'a', 'd'])
  })

  it('reads a query from a web build that names no audience as public', () => {
    const { audience: _audience, viewerId: _viewerId, ...previous } = query()
    expect(rosterDiscoveryQuerySchema.parse(previous)).toMatchObject({ audience: 'public', viewerId: null })
  })

  it('refuses a page larger than the bound', () => {
    expect(rosterDiscoveryQuerySchema.safeParse(query({ limit: ROSTER_DISCOVERY_MAX_PAGE_SIZE + 1 })).success).toBe(false)
  })

  it('refuses more saved IDs than the bound', () => {
    expect(
      rosterDiscoveryQuerySchema.safeParse(query({ catalogueIds: Array.from({ length: 1_001 }, (_, index) => `id-${index}`) })).success,
    ).toBe(false)
  })
})

describe('roster discovery scope', () => {
  it('asks for every rules version of a faction', () => {
    expect(discoveryScope({ faction: 'necrons' }, factions)?.catalogueIds).toEqual(['necrons', 'legacy~necrons', 'preview~necrons'])
  })

  it('asks for archived rules versions only', () => {
    expect(discoveryScope({ rules: 'archived' }, factions)?.catalogueIds).toEqual(['legacy~necrons'])
  })

  it('asks for the saved IDs a replaced book was stored under', () => {
    expect(discoveryScope({ faction: ultramarines.current }, factions)?.catalogueIds).toContain(ultramarines.retired)
  })

  it('asks for no book when no faction is chosen', () => {
    expect(discoveryScope({}, factions)).toEqual({ catalogueIds: null, detachmentIds: null })
  })

  it('finds nothing for a faction without a rules version in that state', () => {
    expect(discoveryScope({ faction: ultramarines.current, rules: 'preview' }, factions)).toBeNull()
  })

  it('places a roster on an archived rules version outside the current filter', () => {
    expect(inDiscoveryScope({ catalogueId: 'legacy~necrons', detachmentIds: [] }, { rules: 'current' }, indexed)).toBe(false)
  })

  it('places a roster inside its faction family whatever its rules version', () => {
    expect(inDiscoveryScope({ catalogueId: 'legacy~necrons', detachmentIds: [] }, { faction: 'necrons' }, indexed)).toBe(true)
  })

  it('places a roster outside a detachment it does not hold', () => {
    expect(inDiscoveryScope({ catalogueId: 'necrons', detachmentIds: ['awakened'] }, { detachment: 'hypercrypt' }, indexed)).toBe(false)
  })
})
