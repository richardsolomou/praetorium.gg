import { z } from 'zod'
import { detachmentIds } from './savedRoster'
import { compareRosters, ROSTER_SORTS } from './rosterSort'
import { facetActive, facetMatches, facetSchema, periodFields, type Facet } from './listFilter'
import { matchesSearch } from './text'

export const ROSTER_DISCOVERY_PAGE_SIZE = 24
export const ROSTER_DISCOVERY_MAX_PAGE_SIZE = 50
const ROSTER_DISCOVERY_MAX_SCOPE_IDS = 1_000

export const ROSTER_AUDIENCES = ['public', 'friends'] as const
export type RosterAudience = (typeof ROSTER_AUDIENCES)[number]

export const RULES_VERSION_STATUSES = ['current', 'archived', 'preview'] as const
export type RulesVersionStatus = (typeof RULES_VERSION_STATUSES)[number]

const id = z.string().min(1).max(128)

/** The last roster a page showed, by the facts any order compares; `at` is its update time. The defaults read a cursor from a web build that paged only by update time. */
export const rosterDiscoveryCursorSchema = z.object({
  at: z.number().int().nonnegative(),
  id,
  name: z.string().max(1_000).default(''),
  limit: z.number().int().nonnegative().default(0),
  createdAt: z.number().int().nonnegative().default(0),
})
export type RosterDiscoveryCursor = z.infer<typeof rosterDiscoveryCursorSchema>

const rosterFacets = {
  /** Faction families (`currentCatalogueFamilyId`). */
  faction: facetSchema,
  detachment: facetSchema,
  /** `RULES_VERSION_STATUSES`. */
  rules: facetSchema,
  size: facetSchema,
  disposition: facetSchema,
  /** Known only once a roster is priced, so these two narrow what the database returned. */
  legality: facetSchema,
  points: facetSchema,
}

export const ROSTER_SEARCH_MAX_LENGTH = 80
const q = z.string().trim().min(1).max(ROSTER_SEARCH_MAX_LENGTH).optional()

export const rosterDiscoveryFilterSchema = z.strictObject({ q, ...rosterFacets, owner: facetSchema })
export type RosterDiscoveryFilter = z.infer<typeof rosterDiscoveryFilterSchema>

export const playedArmyFilterSchema = z.strictObject({
  q,
  ...rosterFacets,
  result: facetSchema,
  against: facetSchema,
  ...periodFields,
})
export type PlayedArmyFilter = z.infer<typeof playedArmyFilterSchema>

export const ROSTER_POINTS_BANDS = [
  { value: 'under-1000', label: 'Under 1,000', below: 1_000 },
  { value: '1000-1499', label: '1,000 to 1,499', below: 1_500 },
  { value: '1500-1999', label: '1,500 to 1,999', below: 2_000 },
  { value: '2000-plus', label: '2,000 or more', below: Infinity },
] as const

type RosterAssessmentFilter = { legality?: Facet; points?: Facet }

export const rosterAssessmentFilterActive = (filter: RosterAssessmentFilter) => facetActive(filter.legality) || facetActive(filter.points)

/** A roster the current data could not price is in no band and neither legal nor illegal, so only an exclusion lets it through. */
export function matchesRosterAssessment(
  filter: RosterAssessmentFilter,
  { points, problem }: { points: number | null; problem: string | null },
) {
  if (points === null) return facetMatches(filter.legality, []) && facetMatches(filter.points, [])
  return (
    facetMatches(filter.legality, [problem ?? 'legal']) &&
    facetMatches(filter.points, [ROSTER_POINTS_BANDS.find((band) => points < band.below)!.value])
  )
}

/**
 * What the product database is asked for: the saved IDs a roster inside the filter is stored under, and whose rosters.
 * The public audience leaves out the viewer's own; the friends audience holds only the viewer's accepted friends'.
 * Both default, because the module is published before the web build that sends them.
 */
export const rosterDiscoveryQuerySchema = z.strictObject({
  audience: z.enum(ROSTER_AUDIENCES).default('public'),
  viewerId: id.nullable().default(null),
  sort: z.enum(ROSTER_SORTS).default('updated-desc'),
  catalogueIds: z.array(id).max(ROSTER_DISCOVERY_MAX_SCOPE_IDS).nullable(),
  detachmentIds: z.array(id).max(ROSTER_DISCOVERY_MAX_SCOPE_IDS).nullable(),
  excludedDetachmentIds: z.array(id).max(ROSTER_DISCOVERY_MAX_SCOPE_IDS).optional(),
  sizes: facetSchema,
  dispositions: facetSchema,
  owners: facetSchema,
  /** Matches a roster's name, or any roster of `namedOwnerIds`, whose names only the account database holds. */
  q,
  namedOwnerIds: z.array(id).max(ROSTER_DISCOVERY_MAX_SCOPE_IDS).optional(),
  before: rosterDiscoveryCursorSchema.nullable(),
  limit: z.number().int().min(1).max(ROSTER_DISCOVERY_MAX_PAGE_SIZE),
})
export type RosterDiscoveryQuery = z.infer<typeof rosterDiscoveryQuerySchema>

/**
 * One page of discoverable rosters in the requested order.
 *
 * Choosing Public is the owner's consent to be listed; unlisted rosters are links their
 * owner handed to somebody, so they never appear. Only `limit + 1` rows are held at once.
 */
export function discoveryPage<
  T extends {
    id: string
    userId: string
    name: string
    limit: number
    visibility: string
    catalogueId: string
    detachmentId?: string | null
    disposition?: string | null
    createdAt: number
    updatedAt: number
  },
>(rows: Iterable<T>, query: RosterDiscoveryQuery, friendIds: ReadonlySet<string> = new Set()) {
  const catalogues = query.catalogueIds && new Set(query.catalogueIds)
  const detachments = query.detachmentIds && new Set(query.detachmentIds)
  const excludedDetachments = new Set(query.excludedDetachmentIds)
  const namedOwners = new Set(query.namedOwnerIds)
  const order = compareRosters(query.sort)
  const { before } = query
  const after = before && { id: before.id, name: before.name, limit: before.limit, createdAt: before.createdAt, updatedAt: before.at }
  const kept: T[] = []
  let total = 0
  for (const row of rows) {
    if (row.visibility !== 'public') continue
    if (query.audience === 'friends' ? !friendIds.has(row.userId) : row.userId === query.viewerId) continue
    if (catalogues && !catalogues.has(row.catalogueId)) continue
    if (detachments && !detachmentIds(row.detachmentId).some((saved) => detachments.has(saved))) continue
    if (detachmentIds(row.detachmentId).some((saved) => excludedDetachments.has(saved))) continue
    if (!facetMatches(query.sizes, [String(row.limit)])) continue
    if (!facetMatches(query.dispositions, row.disposition ? [row.disposition] : [])) continue
    if (!facetMatches(query.owners, [row.userId])) continue
    if (query.q && !namedOwners.has(row.userId) && !matchesSearch(row.name, query.q)) continue
    total += 1
    // A cursor from a build that paged only by update time carries no name, so its own roster is matched by ID.
    if (after && (row.id === after.id || order(row, after) <= 0)) continue
    if (kept.length > query.limit && order(row, kept.at(-1)!) >= 0) continue
    kept.push(row)
    kept.sort(order)
    if (kept.length > query.limit + 1) kept.pop()
  }
  const shown = kept.slice(0, query.limit)
  const last = shown.at(-1)
  return {
    rows: shown,
    /** Every roster the filter finds, across all pages. */
    total,
    nextCursor:
      kept.length > query.limit && last
        ? { at: last.updatedAt, id: last.id, name: last.name, limit: last.limit, createdAt: last.createdAt }
        : null,
  }
}
