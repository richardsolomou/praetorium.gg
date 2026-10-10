import { calculateRosterAssessment, calculateRosterTotals, savedRosterPriceInput } from '../../shared/pricing'
import { rosterUseProblem } from '../../core/rosterLegality'
import { localConstruction } from './construction'
import type { LocalRoster } from './localRuntime'

type Assessment = { points: number | null; problem: NonNullable<ReturnType<typeof rosterUseProblem>>['kind'] | null; label: string }
const cache = new Map<string, { version: number; revision: string; data: Assessment }>()
const CACHE_LIMIT = 500

export async function localRosterAssessment(roster: LocalRoster, owner: string) {
  const local = localConstruction(roster.catalogueId)
  if (!local) return { points: null, problem: null, label: roster.name }
  const key = JSON.stringify([owner, roster.id])
  const cached = cache.get(key)
  if (cached?.version === roster.updatedAt && cached.revision === local.revision) return cached.data
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  const input = savedRosterPriceInput(roster)
  const assessed = calculateRosterAssessment(input, local.catalogue, local.rules)
  const data: Assessment = {
    points: assessed?.points ?? null,
    problem: assessed ? (rosterUseProblem(assessed, roster.limit, roster.waivedRules)?.kind ?? null) : null,
    label: roster.name || calculateRosterTotals(input, local.catalogue, local.rules)?.label || '',
  }
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!)
  cache.set(key, { version: roster.updatedAt, revision: local.revision, data })
  return data
}
