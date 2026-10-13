import type { Roster } from './battle'

/** Every Force Disposition an army's detachments offered, or its chosen card where a snapshot predates the offered list. */
export function offeredDispositions(roster: Roster | null | undefined): string[] {
  const built = roster?.built
  if (!built) return []
  return built.dispositions ?? (built.disposition ? [built.disposition] : [])
}

/**
 * The cards a side may play, given the armies seated on it.
 *
 * A lone army plays the card its list chose. Allies field one army between them, so they choose
 * from every card either list's detachments offered, not only the ones each list happened to pick.
 */
export function teamDispositionChoices(rosters: readonly (Roster | null | undefined)[]): string[] {
  if (rosters.length < 2) return rosters[0]?.built?.disposition ? [rosters[0].built.disposition] : []
  return [...new Set(rosters.flatMap(offeredDispositions))]
}

/** The card a side plays: its valid pick, else the one card its lists agree on or could play; null while allies still owe a choice. */
export function teamDisposition(rosters: readonly (Roster | null | undefined)[], picked: string | null): string | null {
  const choices = teamDispositionChoices(rosters)
  if (picked && choices.includes(picked)) return picked
  if (choices.length === 1) return choices[0]!
  const chosen = new Set(rosters.flatMap((roster) => (roster?.built?.disposition ? [roster.built.disposition] : [])))
  return chosen.size === 1 ? [...chosen][0]! : null
}
