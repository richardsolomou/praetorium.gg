import type { z } from 'zod'
import type { rosterDiscoverySchema } from '../contracts/schemas'
import { byId } from '../core/collections'
import {
  matchesRosterAssessment,
  rosterAssessmentFilterActive,
  ROSTER_DISCOVERY_MAX_PAGE_SIZE,
  ROSTER_DISCOVERY_PAGE_SIZE,
} from '../core/rosterDiscovery'
import { discoveryScope, inDiscoveryScope, namedArmyIds } from '../core/rosterDiscoveryScope'
import { app } from './app'
import { cachedRosterAssessmentsFor } from './rosterPrices'

/** How many full pages a legality or points filter prices at most in one read; every roster costs a pricing the first time. */
const ASSESSED_DISCOVERY_READS = 4

/** One page of the rosters an audience holds, each priced and checked against the current data. */
export async function discoverRosterPage(
  { audience, sort, before, ...filter }: z.output<typeof rosterDiscoverySchema>,
  viewerId: string | null,
) {
  const instance = app()
  const factions = (await instance.factionIndexFor())?.factions ?? []
  const scope = discoveryScope(filter, factions)
  if (!scope || (audience === 'friends' && !viewerId)) return { rosters: [], total: 0, nextCursor: null }
  const namedOwnerIds = filter.q ? await instance.service.rosterService.ownerIdsNamed(filter.q, viewerId) : []
  const indexed = byId(factions)
  const assessed = rosterAssessmentFilterActive(filter)
  const found = []
  let total: number | null = null
  let cursor = before
  for (let walked = 0; walked < (assessed ? ASSESSED_DISCOVERY_READS : 1); walked++) {
    const page = await instance.service.rosterService.discoverRosters({
      ...scope,
      sizes: filter.size,
      dispositions: filter.disposition,
      owners: filter.owner,
      q: filter.q,
      namedOwnerIds,
      ...(filter.q ? namedArmyIds(filter.q, factions) : {}),
      audience,
      viewerId,
      sort,
      before: cursor,
      limit: assessed ? ROSTER_DISCOVERY_MAX_PAGE_SIZE : ROSTER_DISCOVERY_PAGE_SIZE,
    })
    const shown = page.rosters.filter(({ summary }) => inDiscoveryScope(summary, filter, indexed))
    const assessments = await cachedRosterAssessmentsFor(shown.map(({ priceable }) => priceable))
    for (const [index, { summary, owner, priceable }] of shown.entries()) {
      const { points, verdict } = assessments[index]!
      if (matchesRosterAssessment(filter, { points, problem: verdict.problem }))
        found.push({ priceable, entry: { roster: summary, owner, points, problem: verdict.problem } })
    }
    // A count of what the database found would include rosters this filter then drops.
    total = assessed ? null : page.total
    cursor = page.nextCursor
    if (!cursor || found.length >= ROSTER_DISCOVERY_PAGE_SIZE) break
  }
  const last = found.length > ROSTER_DISCOVERY_PAGE_SIZE ? found[ROSTER_DISCOVERY_PAGE_SIZE - 1]!.priceable : null
  return {
    rosters: found.slice(0, ROSTER_DISCOVERY_PAGE_SIZE).map(({ entry }) => entry),
    total,
    nextCursor: last ? { at: last.updatedAt, id: last.id, name: last.name, limit: last.limit, createdAt: last.createdAt } : cursor,
  }
}
