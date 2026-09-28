import { app } from './app'
import type { BuiltUnit } from '../core/roster'
import { calculateRosterAssessment, calculateRosterPrice, calculateRosterTotals, savedRosterPriceInput } from './pricing'
import { type RosterVerdict, rosterVerdict } from './rosterStatus'

/**
 * A list's total and display name change only when the list or the catalogue
 * does, and both are in the key: `updatedAt` moves with every save and the revision
 * with every snapshot. A stale entry can therefore never be served, only evicted.
 */
const rosterTotalsCache = new Map<string, ReturnType<typeof calculateRosterTotals>>()
const ROSTER_TOTALS_CACHE_LIMIT = 10_000

const revisionKey = (roster: { id: string; updatedAt: Date | number }, revision: string) =>
  `${roster.id}:${new Date(roster.updatedAt).getTime()}:${revision}`

async function rosterRevisionKey(roster: { id: string; updatedAt: Date | number }) {
  return revisionKey(roster, (await app().factionIndexFor())?.revision ?? 'none')
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
  const revision = (await app().factionIndexFor())?.revision ?? 'none'
  const values: ReturnType<typeof calculateRosterTotals>[] = Array(rosters.length).fill(null)
  const missing = new Map<string, number[]>()
  rosters.forEach((roster, index) => {
    const key = revisionKey(roster, revision)
    if (rosterTotalsCache.has(key)) {
      values[index] = rosterTotalsCache.get(key) ?? null
      return
    }
    const positions = missing.get(roster.catalogueId) ?? []
    positions.push(index)
    missing.set(roster.catalogueId, positions)
  })
  if (!missing.size) return values
  const rules = await app().rosterLabelRulesFor()
  for (const [catalogueId, positions] of missing) {
    const loaded = await app().catalogueFor(catalogueId)
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
      if (rosterTotalsCache.size >= ROSTER_TOTALS_CACHE_LIMIT) {
        const oldest = rosterTotalsCache.keys().next().value
        if (oldest !== undefined) rosterTotalsCache.delete(oldest)
      }
      rosterTotalsCache.set(revisionKey(roster, revision), totals)
    }
  }
  return values
}

const rosterPriceCache = new Map<string, ReturnType<typeof calculateRosterPrice>>()
const ROSTER_PRICE_CACHE_LIMIT = 500

export async function cachedRosterPrice(roster: {
  id: string
  updatedAt: Date | number
  catalogueId: string
  detachmentIds: string[]
  disposition: string | null
  limit: number
  picks: Parameters<typeof calculateRosterPrice>[0]['units']
  waivedRules: Parameters<typeof calculateRosterPrice>[0]['waivedRules']
  optionalRules: Parameters<typeof calculateRosterPrice>[0]['optionalRules']
  borrowedDetachmentId: string | null
}) {
  const key = await rosterRevisionKey(roster)
  const cached = rosterPriceCache.get(key)
  if (cached !== undefined || rosterPriceCache.has(key)) return cached ?? null
  const [catalogue, rules] = await Promise.all([app().catalogueFor(roster.catalogueId), app().rulesFor()])
  const price = calculateRosterPrice(savedRosterPriceInput(roster), catalogue, rules)
  if (rosterPriceCache.size >= ROSTER_PRICE_CACHE_LIMIT) {
    const oldest = rosterPriceCache.keys().next().value
    if (oldest !== undefined) rosterPriceCache.delete(oldest)
  }
  rosterPriceCache.set(key, price)
  return price
}

/** Library assessments keep points and verdicts without retaining unit projections. */
type RosterAssessment = { verdict: RosterVerdict; points: number | null }
const rosterVerdictCache = new Map<string, RosterAssessment>()
const ROSTER_VERDICT_CACHE_LIMIT = 10_000

export async function cachedRosterAssessmentsFor(rosters: readonly Parameters<typeof cachedRosterPrice>[0][]) {
  if (!rosters.length) return []
  const revision = (await app().factionIndexFor())?.revision ?? 'none'
  const values: RosterAssessment[] = Array(rosters.length)
  const missing = new Map<string, number[]>()
  rosters.forEach((roster, index) => {
    const key = revisionKey(roster, revision)
    const cached = rosterVerdictCache.get(key)
    if (cached) {
      values[index] = cached
      return
    }
    const positions = missing.get(roster.catalogueId) ?? []
    positions.push(index)
    missing.set(roster.catalogueId, positions)
  })
  if (!missing.size) return values
  // Without the rules source a list cannot be judged the way a battle judges it.
  const rules = await app().rulesFor()
  for (const [catalogueId, positions] of missing) {
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
      if (rosterVerdictCache.size >= ROSTER_VERDICT_CACHE_LIMIT) {
        const oldest = rosterVerdictCache.keys().next().value
        if (oldest !== undefined) rosterVerdictCache.delete(oldest)
      }
      rosterVerdictCache.set(key, assessment)
    }
  }
  return values
}

export async function cachedRosterVerdictsFor(rosters: readonly Parameters<typeof cachedRosterPrice>[0][]) {
  return (await cachedRosterAssessmentsFor(rosters)).map((assessment) => assessment.verdict)
}
