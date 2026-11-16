import type { Roster } from './battle'

/** Every Force Disposition an army's detachments offered, or its chosen card where a snapshot predates the offered list. */
function offeredDispositions(roster: Roster | null | undefined): string[] {
  const built = roster?.built
  if (!built) return []
  return built.dispositions ?? (built.disposition ? [built.disposition] : [])
}

/**
 * The cards a side may play, given the armies seated on it.
 *
 * A side picks at the Mission step from every card its armies' detachments offer, allies from either list's. A lone
 * list sealed for an event plays the card it was sealed with, because the event fixed that choice before the reveal.
 */
export function teamDispositionChoices(rosters: readonly (Roster | null | undefined)[], sealed = false): string[] {
  if (sealed && rosters.length < 2) return rosters[0]?.built?.disposition ? [rosters[0].built.disposition] : []
  return [...new Set(rosters.flatMap(offeredDispositions))]
}

/**
 * The card a side plays: its valid pick, else the one card it could play or its lists already name; null while the
 * side still owes a choice.
 */
export function teamDisposition(rosters: readonly (Roster | null | undefined)[], picked: string | null, sealed = false): string | null {
  const choices = teamDispositionChoices(rosters, sealed)
  if (picked && choices.includes(picked)) return picked
  if (choices.length === 1) return choices[0]!
  const chosen = new Set(rosters.flatMap((roster) => (roster?.built?.disposition ? [roster.built.disposition] : [])))
  return chosen.size === 1 ? [...chosen][0]! : null
}
