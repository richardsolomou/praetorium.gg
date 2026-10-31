import { calculateRosterAssessment, calculateRosterTotals, savedRosterPriceInput } from '../../shared/pricing'
import { RecentlyUsed } from '../../core/collections'
import { rosterUseProblem } from '../../core/rosterLegality'
import { localConstruction } from './construction'
import type { LocalRoster } from './localRuntime'
import { nextTask } from '../../shared/nextTask'

type Assessment = { points: number | null; problem: NonNullable<ReturnType<typeof rosterUseProblem>>['kind'] | null; label: string }
const cache = new RecentlyUsed<string, { version: number; revision: string; data: Assessment }>(500)

export async function localRosterAssessment(roster: LocalRoster, owner: string) {
  const local = await localConstruction(roster.catalogueId)
  if (!local) return { points: null, problem: null, label: roster.name }
  const key = JSON.stringify([owner, roster.id])
  const cached = cache.get(key)
  if (cached?.version === roster.updatedAt && cached.revision === local.revision) return cached.data
  await nextTask()
  const input = savedRosterPriceInput(roster)
  const assessed = calculateRosterAssessment(input, local.catalogue, local.rules)
  const data: Assessment = {
    points: assessed?.points ?? null,
    problem: assessed ? (rosterUseProblem(assessed, roster)?.kind ?? null) : null,
    label: roster.name || calculateRosterTotals(input, local.catalogue, local.rules)?.label || '',
  }
  cache.set(key, { version: roster.updatedAt, revision: local.revision, data })
  return data
}
