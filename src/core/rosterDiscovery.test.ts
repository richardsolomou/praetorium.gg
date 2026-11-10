import { describe, expect, it } from 'vitest'
import {
  matchesRosterAssessment,
  ROSTER_DISCOVERY_MAX_PAGE_SIZE,
  discoveryPage,
  rosterDiscoveryCursorSchema,
  rosterDiscoveryQuerySchema,
  type RosterDiscoveryQuery,
} from './rosterDiscovery'
import { againstFamilies, discoveryCounts, discoveryScope, inDiscoveryScope } from './rosterDiscoveryScope'

type Row = {
  id: string
  userId: string
  name: string
  limit: number
  visibility: string
  catalogueId: string
  detachmentId: string | null
  createdAt: number
  updatedAt: number
}

const row = (id: string, updatedAt: number, overrides: Partial<Row> = {}): Row => ({
  id,
  userId: 'owner',
  name: id,
  limit: 2_000,
  visibility: 'public',
  catalogueId: 'necrons',
  detachmentId: '["awakened"]',
  createdAt: updatedAt,
  updatedAt,
  ...overrides,
})
const query = (overrides: Partial<RosterDiscoveryQuery> = {}): RosterDiscoveryQuery => ({
  audience: 'public',
  viewerId: null,
  sort: 'updated-desc',
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

describe('roster assessment filters', () => {
  const legal = { in: ['legal'], out: [] }
  it('leaves out a roster the current data could not price when legal lists are asked for', () => {
    expect(matchesRosterAssessment({ legality: legal }, { points: null, problem: null })).toBe(false)
  })
  it('counts 2,000 points in the top band, not the one below it', () => {
    expect(matchesRosterAssessment({ points: { in: ['2000-plus'], out: [] } }, { points: 2_000, problem: null })).toBe(true)
  })
  it('tells an over-limit list from a legal one', () => {
    expect(matchesRosterAssessment({ legality: legal }, { points: 2_010, problem: 'over-limit' })).toBe(false)
  })
})

describe('roster discovery pages', () => {
  it('counts every roster the filter finds, not only the page', () => {
    const rows = [
      ...Array.from({ length: 30 }, (_, index) => row(`necrons-${index}`, index)),
      row('orks', 99, { catalogueId: 'orks' }),
      row('private', 98, { visibility: 'private' }),
    ]
    expect(discoveryPage(rows, query({ catalogueIds: ['necrons'], limit: 24 })).total).toBe(30)
  })

  it('lists the most recently saved roster first', () => {
    expect(ids([row('older', 1), row('newest', 3), row('newer', 2)])).toEqual(['newest', 'newer', 'older'])
  })

  it('holds no more than the page size', () => {
    expect(ids([row('a', 1), row('b', 2), row('c', 3)], { limit: 2 })).toEqual(['c', 'b'])
  })

  it('points the next page after the last roster shown', () => {
    expect(discoveryPage([row('a', 1), row('b', 2), row('c', 3)], query({ limit: 2 })).nextCursor).toMatchObject({ at: 2, id: 'b' })
  })

  it('lists rosters in the requested order', () => {
    expect(ids([row('beta', 1), row('alpha', 2), row('gamma', 3)], { sort: 'name-asc' })).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('continues a sorted page from its cursor', () => {
    const rows = [row('small', 3, { limit: 500 }), row('large', 1, { limit: 3_000 }), row('middle', 2, { limit: 2_000 })]
    const first = discoveryPage(rows, query({ limit: 1, sort: 'size-desc' }))
    expect(ids(rows, { limit: 2, sort: 'size-desc', before: first.nextCursor })).toEqual(['middle', 'small'])
  })

  it('reads a cursor from a web build that paged only by update time', () => {
    expect(ids([row('older', 1), row('newer', 2)], { before: rosterDiscoveryCursorSchema.parse({ at: 2, id: 'newer' }) })).toEqual([
      'older',
    ])
  })

  it('has no next page when the last roster fits', () => {
    expect(discoveryPage([row('a', 1), row('b', 2)], query({ limit: 2 })).nextCursor).toBeNull()
  })

  it('continues from the cursor without repeating or skipping rosters saved at the same moment', () => {
    const rows = [row('a', 5), row('b', 5), row('c', 5), row('d', 4)]
    const first = discoveryPage(rows, query({ limit: 2 }))
    expect([...first.rows.map((r) => r.id), ...ids(rows, { limit: 2, before: first.nextCursor })]).toEqual(['a', 'b', 'c', 'd'])
  })

  it('reads a query from a web build that names no audience as public', () => {
    const { audience: _audience, viewerId: _viewerId, sort: _sort, ...previous } = query()
    expect(rosterDiscoveryQuerySchema.parse(previous)).toMatchObject({ audience: 'public', viewerId: null, sort: 'updated-desc' })
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

const only = (value: string) => ({ in: [value], out: [] })

describe('roster discovery scope', () => {
  it('leaves out an excluded faction and keeps the rest', () => {
    expect(discoveryScope({ faction: { in: [], out: ['necrons'] } }, factions)?.catalogueIds).not.toContain('necrons')
  })

  it('asks for every rules version of a faction', () => {
    expect(discoveryScope({ faction: only('necrons') }, factions)?.catalogueIds).toEqual(['necrons', 'legacy~necrons', 'preview~necrons'])
  })

  it('asks for archived rules versions only', () => {
    expect(discoveryScope({ rules: only('archived') }, factions)?.catalogueIds).toEqual(['legacy~necrons'])
  })

  it('asks for the saved IDs a replaced book was stored under', () => {
    expect(discoveryScope({ faction: only(ultramarines.current) }, factions)?.catalogueIds).toContain(ultramarines.retired)
  })

  it('asks for no book when no faction is chosen', () => {
    expect(discoveryScope({}, factions)).toEqual({ catalogueIds: null, detachmentIds: null, excludedDetachmentIds: [] })
  })

  it('finds nothing for a faction without a rules version in that state', () => {
    expect(discoveryScope({ faction: only(ultramarines.current), rules: only('preview') }, factions)).toBeNull()
  })

  it('places a roster on an archived rules version outside the current filter', () => {
    expect(inDiscoveryScope({ catalogueId: 'legacy~necrons', detachmentIds: [] }, { rules: only('current') }, indexed)).toBe(false)
  })

  it('places a roster inside its faction family whatever its rules version', () => {
    expect(inDiscoveryScope({ catalogueId: 'legacy~necrons', detachmentIds: [] }, { faction: only('necrons') }, indexed)).toBe(true)
  })

  it('places a roster outside a detachment it does not hold', () => {
    expect(inDiscoveryScope({ catalogueId: 'necrons', detachmentIds: ['awakened'] }, { detachment: only('hypercrypt') }, indexed)).toBe(
      false,
    )
  })
})

describe('roster discovery counts', () => {
  const tally = (rows: Row[], overrides: Partial<RosterDiscoveryQuery> = {}) =>
    discoveryPage(rows, query({ tally: true, ...overrides })).groups?.reduce((total, group) => total + group.count, 0)

  it('counts the whole audience, whatever the filters leave', () => {
    expect(tally([row('necrons', 1), row('orks', 2, { catalogueId: 'orks' })], { catalogueIds: ['necrons'] })).toBe(2)
  })

  it("leaves the viewer's own rosters out of the public audience's counts", () => {
    expect(tally([row('theirs', 1), row('mine', 2, { userId: 'viewer' })], { viewerId: 'viewer' })).toBe(1)
  })

  it('counts a rules version of a faction under its family', () => {
    expect(
      discoveryCounts([{ catalogueId: 'mfm-14~necrons', detachmentIds: [], limit: 2_000, disposition: null }], new Map()).faction,
    ).toEqual({ necrons: 1 })
  })
})

describe('played army opponents', () => {
  const factions = [{ id: '1f19-6509-d906-ca10', slug: 'adeptus-custodes' }]

  it('reads an Against slug as its faction family', () => {
    expect(againstFamilies({ in: ['adeptus-custodes'], out: [] }, factions).in).toEqual(['1f19-6509-d906-ca10'])
  })

  it('keeps a slug the index does not know, so it matches nothing', () => {
    expect(againstFamilies({ in: ['no-such-army'], out: [] }, factions).in).toEqual(['no-such-army'])
  })
})
