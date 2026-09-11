import type { RosterPick } from '../../../core/roster'

const samePick = (previous: unknown, current: RosterPick | undefined) =>
  typeof previous === 'object' &&
  previous !== null &&
  'entryId' in previous &&
  'catalogueId' in previous &&
  previous.entryId === current?.entryId &&
  previous.catalogueId === current?.catalogueId

/**
 * Which of the previously priced units the list still holds, in the order it holds them now.
 *
 * A price is always one request behind the picks it describes and the roster is drawn
 * from the price, so what to draw while the new one is in flight is the old one with
 * the departed units taken out. Answering "nothing" empties the roster in front of the
 * player, which is what deleting a unit used to do for as long as the round trip took.
 *
 * Only a leading run is returned. A pick that matches nothing left is where the old
 * prices stop describing this list, and everything past it would be drawn against the
 * wrong unit — so those cards wait for the answer, exactly as a newly added one does.
 */
export function survivingUnits(previous: unknown, current: readonly RosterPick[]): number[] | null {
  if (!Array.isArray(previous)) return null
  const kept: number[] = []
  let at = 0
  for (const pick of current) {
    while (at < previous.length && !samePick(previous[at], pick)) at++
    if (at >= previous.length) break
    kept.push(at)
    at++
  }
  return kept
}
