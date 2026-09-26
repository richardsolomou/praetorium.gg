import { app } from './app'
import { calculateRosterPrice, calculateRosterTotals, savedRosterPriceInput } from './pricing'
import { type RosterVerdict, rosterVerdict } from './rosterStatus'

/**
 * A list's total and its fallback label change only when the list or the catalogue
 * does, and both are in the key: `updatedAt` moves with every save and the revision
 * with every snapshot. A stale entry can therefore never be served, only evicted.
 */
const rosterTotalsCache = new Map<string, ReturnType<typeof calculateRosterTotals>>()
const ROSTER_TOTALS_CACHE_LIMIT = 10_000

async function rosterRevisionKey(roster: { id: string; updatedAt: Date | number }) {
  const revision = (await app().factionIndexFor())?.revision ?? 'none'
  return `${roster.id}:${new Date(roster.updatedAt).getTime()}:${revision}`
}

export async function cachedRosterTotals(roster: {
  id: string
  updatedAt: Date | number
  catalogueId: string
  detachmentIds: string[]
  disposition: string | null
  limit: number
  picks: Parameters<typeof calculateRosterTotals>[0]['units']
  waivedRules: Parameters<typeof calculateRosterTotals>[0]['waivedRules']
}) {
  const key = await rosterRevisionKey(roster)
  const cached = rosterTotalsCache.get(key)
  if (cached !== undefined || rosterTotalsCache.has(key)) return cached ?? null
  const totals = calculateRosterTotals(
    {
      catalogueId: roster.catalogueId,
      detachmentIds: roster.detachmentIds,
      disposition: roster.disposition,
      limit: roster.limit,
      units: roster.picks,
      waivedRules: roster.waivedRules,
    },
    await app().catalogueFor(roster.catalogueId),
    await app().rulesFor(),
  )
  if (rosterTotalsCache.size >= ROSTER_TOTALS_CACHE_LIMIT) {
    const oldest = rosterTotalsCache.keys().next().value
    if (oldest !== undefined) rosterTotalsCache.delete(oldest)
  }
  rosterTotalsCache.set(key, totals)
  return totals
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
  const price = calculateRosterPrice(savedRosterPriceInput(roster), await app().catalogueFor(roster.catalogueId), await app().rulesFor())
  if (rosterPriceCache.size >= ROSTER_PRICE_CACHE_LIMIT) {
    const oldest = rosterPriceCache.keys().next().value
    if (oldest !== undefined) rosterPriceCache.delete(oldest)
  }
  rosterPriceCache.set(key, price)
  return price
}

/**
 * Whether each list is legal, and what it holds, by the same key as its price: judged
 * once per save per snapshot. Only the verdict is kept, so a library of lists costs a
 * few names apiece rather than every unit's projection.
 */
const rosterVerdictCache = new Map<string, RosterVerdict>()
const ROSTER_VERDICT_CACHE_LIMIT = 10_000

export async function cachedRosterVerdict(roster: Parameters<typeof cachedRosterPrice>[0]) {
  const key = await rosterRevisionKey(roster)
  const cached = rosterVerdictCache.get(key)
  if (cached) return cached
  // Without the rules source a list cannot be judged the way a battle judges it.
  const rules = await app().rulesFor()
  const priced = rules
    ? (rosterPriceCache.get(key) ??
      calculateRosterPrice(savedRosterPriceInput(roster), await app().catalogueFor(roster.catalogueId), rules))
    : null
  const verdict = rosterVerdict(roster, priced)
  if (rosterVerdictCache.size >= ROSTER_VERDICT_CACHE_LIMIT) {
    const oldest = rosterVerdictCache.keys().next().value
    if (oldest !== undefined) rosterVerdictCache.delete(oldest)
  }
  rosterVerdictCache.set(key, verdict)
  return verdict
}
