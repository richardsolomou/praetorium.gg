import { RecentlyUsed, remember } from '../core/collections'
import { app } from './app'
import type { BuiltUnit } from '../core/roster'
import { calculateRosterAssessment, calculateRosterPrice, calculateRosterTotals, savedRosterPriceInput } from '../shared/pricing'
import { type RosterVerdict, rosterVerdict } from './rosterStatus'

/**
 * A list's total and display name change only when the list or the catalogue
 * does, and both are in the key: `updatedAt` moves with every save and the revision
 * with every snapshot. A stale entry can therefore never be served, only evicted.
 */
const rosterTotalsCache = new RecentlyUsed<string, ReturnType<typeof calculateRosterTotals>>(10_000)

const revisionKey = (roster: { id: string; updatedAt: Date | number }, revision: string) =>
  `${roster.id}:${new Date(roster.updatedAt).getTime()}:${revision}`

const catalogueRevision = async () => (await app().factionIndexFor())?.revision ?? 'none'

/** The value `cache` already holds for each roster, by position, and the positions still to compute, by catalogue. */
function cachedByPosition<T>(
  rosters: readonly { id: string; updatedAt: Date | number; catalogueId: string }[],
  revision: string,
  cache: RecentlyUsed<string, T>,
) {
  const values: T[] = Array(rosters.length)
  const missing = new Map<string, number[]>()
  rosters.forEach((roster, index) => {
    const key = revisionKey(roster, revision)
    if (cache.has(key)) values[index] = cache.get(key)!
    else remember(missing, roster.catalogueId, () => []).push(index)
  })
  return { values, missing }
}

type TotalsRoster = {
  id: string
  name?: string
  updatedAt: Date | number
  catalogueId: string
  detachmentIds: string[]
  disposition: string | null
  limit: number
  picks: Parameters<typeof calculateRosterTotals>[0]['units']
  waivedRules: Parameters<typeof calculateRosterTotals>[0]['waivedRules']
}

export async function cachedRosterTotalsFor(rosters: readonly TotalsRoster[]) {
  if (!rosters.length) return []
  const revision = await catalogueRevision()
  const { values, missing } = cachedByPosition(rosters, revision, rosterTotalsCache)
  for (const [catalogueId, positions] of missing) {
    const loaded = await app().catalogueFor(catalogueId)
    const rules = await app().rosterLabelRulesFor(catalogueId)
    for (const index of positions) {
      const roster = rosters[index]!
      const totals = calculateRosterTotals(
        {
          catalogueId: roster.catalogueId,
          detachmentIds: roster.detachmentIds,
          disposition: roster.disposition,
          limit: roster.limit,
          units: roster.picks,
          waivedRules: roster.waivedRules,
        },
        loaded,
        rules,
        roster.name,
      )
      values[index] = totals
      rosterTotalsCache.set(revisionKey(roster, revision), totals)
    }
  }
  return values
}

const rosterPriceCache = new RecentlyUsed<string, ReturnType<typeof calculateRosterPrice>>(500)

export async function cachedRosterPrice(
  roster: {
    id: string
    updatedAt: Date | number
    catalogueId: string
    detachmentIds: string[]
    disposition: string | null
    limit: number
    pointsBudget?: number | null
    picks: Parameters<typeof calculateRosterPrice>[0]['units']
    waivedRules: Parameters<typeof calculateRosterPrice>[0]['waivedRules']
    optionalRules: Parameters<typeof calculateRosterPrice>[0]['optionalRules']
    borrowedDetachmentId: string | null
  },
  includeUnitLimits = false,
) {
  const key = `${revisionKey(roster, await catalogueRevision())}${includeUnitLimits ? ':unit-limits' : ''}`
  const cached = rosterPriceCache.get(key)
  if (cached !== undefined || rosterPriceCache.has(key)) return cached ?? null
  const [catalogue, rules] = await Promise.all([app().catalogueFor(roster.catalogueId), app().rulesFor(roster.catalogueId)])
  const price = calculateRosterPrice({ ...savedRosterPriceInput(roster), includeUnitLimits }, catalogue, rules)
  rosterPriceCache.set(key, price)
  return price
}

/** Library assessments keep points and verdicts without retaining unit projections. */
type RosterAssessment = { verdict: RosterVerdict; points: number | null }
const rosterVerdictCache = new RecentlyUsed<string, RosterAssessment>(10_000)

export async function cachedRosterAssessmentsFor(rosters: readonly Parameters<typeof cachedRosterPrice>[0][]) {
  if (!rosters.length) return []
  const revision = await catalogueRevision()
  const { values, missing } = cachedByPosition(rosters, revision, rosterVerdictCache)
  // Without the rules source a list cannot be judged the way a battle judges it.
  for (const [catalogueId, positions] of missing) {
    const rules = await app().rulesFor(catalogueId)
    const unitCache = new Map<string, BuiltUnit | null>()
    const unpriced = positions.some((index) => !rosterPriceCache.get(revisionKey(rosters[index]!, revision)))
    const loaded = rules && unpriced ? await app().catalogueFor(catalogueId) : null
    for (const index of positions) {
      const roster = rosters[index]!
      const key = revisionKey(roster, revision)
      const priced = rules
        ? (rosterPriceCache.get(key) ?? calculateRosterAssessment(savedRosterPriceInput(roster), loaded, rules, unitCache))
        : null
      const assessment = { verdict: rosterVerdict(roster, priced), points: priced?.points ?? null }
      values[index] = assessment
      rosterVerdictCache.set(key, assessment)
    }
  }
  return values
}

export async function cachedRosterVerdictsFor(rosters: readonly Parameters<typeof cachedRosterPrice>[0][]) {
  return (await cachedRosterAssessmentsFor(rosters)).map((assessment) => assessment.verdict)
}
