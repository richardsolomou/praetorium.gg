/**
 * A first army from the models a player owns: a bounded greedy fill, not an optimiser.
 *
 * Unit sizes, copy limits and points come from the pricing authority; this module only
 * chooses among the units it was told are possible, and the saved roster is judged by the
 * same validation as any other.
 */

export type StarterCandidate = {
  entryId: string
  name: string
  owned: number
  size: { min: number; max: number; options?: readonly number[] }
  /** Copies the battle size and detachments allow; null for no limit. */
  limit: number | null
}

export type StarterPick = { entryId: string; name: string; models: number; copy: number }

export type LeftOut = { entryId: string; name: string; models: number; reason: 'too-few' | 'limit' | 'points' }

/** The largest legal unit the remaining models can field, or none. */
function largestSize(size: StarterCandidate['size'], remaining: number) {
  const fitting = size.options
    ? size.options.filter((count) => count >= size.min && count <= Math.min(size.max, remaining))
    : remaining >= size.min
      ? [Math.min(size.max, remaining)]
      : []
  return fitting.length ? Math.max(...fitting) : null
}

/** Every unit the owned models can field within copy limits, each as large as the models allow. */
export function starterPicks(candidates: readonly StarterCandidate[]) {
  const picks: StarterPick[] = []
  const leftOut: LeftOut[] = []
  for (const candidate of candidates) {
    let remaining = candidate.owned
    let copy = 0
    for (let models = largestSize(candidate.size, remaining); models !== null; models = largestSize(candidate.size, remaining)) {
      if (candidate.limit !== null && copy >= candidate.limit) break
      picks.push({ entryId: candidate.entryId, name: candidate.name, models, copy })
      remaining -= models
      copy++
    }
    if (remaining > 0)
      leftOut.push({
        entryId: candidate.entryId,
        name: candidate.name,
        models: remaining,
        reason: copy && candidate.limit !== null && copy >= candidate.limit ? 'limit' : 'too-few',
      })
  }
  return { picks, leftOut }
}

export type PricedStarterPick = StarterPick & { points: number; warlord: boolean }

/**
 * Picks that fit the points budget: the cheapest possible Warlord first, then one of each
 * datasheet before any second copy, most expensive first so the budget is spent on whole units.
 */
export function fitStarterBudget(picks: readonly PricedStarterPick[], budget: number) {
  const warlord = picks.filter((pick) => pick.warlord && pick.points <= budget).toSorted((a, b) => a.points - b.points)[0]
  const rest = picks.filter((pick) => pick !== warlord).toSorted((a, b) => a.copy - b.copy || b.points - a.points)
  const chosen: PricedStarterPick[] = warlord ? [warlord] : []
  const leftOut: LeftOut[] = []
  let points = warlord?.points ?? 0
  for (const pick of rest) {
    if (points + pick.points <= budget) {
      chosen.push(pick)
      points += pick.points
    } else leftOut.push({ entryId: pick.entryId, name: pick.name, models: pick.models, reason: 'points' })
  }
  const order = new Map(picks.map((pick, index) => [pick, index]))
  return { chosen: chosen.toSorted((a, b) => order.get(a)! - order.get(b)!), leftOut, points }
}
