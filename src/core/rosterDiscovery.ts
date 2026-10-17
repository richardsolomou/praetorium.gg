import { z } from 'zod'
import { detachmentIds } from './savedRoster'
import { compareRosters, ROSTER_SORTS } from './rosterSort'

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

/** A faction family (`currentCatalogueFamilyId`), one detachment, and a rules-version status. */
export const rosterDiscoveryFilterSchema = z.strictObject({
  faction: id.optional(),
  detachment: id.optional(),
  rules: z.enum(RULES_VERSION_STATUSES).optional(),
})
export type RosterDiscoveryFilter = z.infer<typeof rosterDiscoveryFilterSchema>

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
    createdAt: number
    updatedAt: number
  },
>(rows: Iterable<T>, query: RosterDiscoveryQuery, friendIds: ReadonlySet<string> = new Set()) {
  const catalogues = query.catalogueIds && new Set(query.catalogueIds)
  const detachments = query.detachmentIds && new Set(query.detachmentIds)
  const order = compareRosters(query.sort)
  const { before } = query
  const after = before && { id: before.id, name: before.name, limit: before.limit, createdAt: before.createdAt, updatedAt: before.at }
  const kept: T[] = []
  for (const row of rows) {
    if (row.visibility !== 'public') continue
    if (query.audience === 'friends' ? !friendIds.has(row.userId) : row.userId === query.viewerId) continue
    if (catalogues && !catalogues.has(row.catalogueId)) continue
    if (detachments && !detachmentIds(row.detachmentId).some((saved) => detachments.has(saved))) continue
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
    nextCursor:
      kept.length > query.limit && last
        ? { at: last.updatedAt, id: last.id, name: last.name, limit: last.limit, createdAt: last.createdAt }
        : null,
  }
}
