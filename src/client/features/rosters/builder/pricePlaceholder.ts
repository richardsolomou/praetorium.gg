import { hashKey } from '@tanstack/react-query'
import type { RosterPick } from '../../../../core/roster'

export const samePriceContext = (previous: readonly unknown[] | undefined, current: readonly unknown[]) =>
  previous !== undefined && hashKey(previous.slice(0, -1)) === hashKey(current.slice(0, -1))

// A copy lands at another position, so what it is attached to is numbered differently.
const loadoutOf = ({ attachedTo: _attachedTo, ...loadout }: RosterPick) => hashKey([loadout])

const sameLoadout = (previous: unknown, current: RosterPick) =>
  typeof previous === 'object' && previous !== null && loadoutOf(previous as RosterPick) === loadoutOf(current)

const samePick = (previous: unknown, current: RosterPick | undefined) =>
  typeof previous === 'object' &&
  previous !== null &&
  'entryId' in previous &&
  previous.entryId === current?.entryId &&
  ('catalogueId' in previous ? previous.catalogueId : undefined) === current?.catalogueId

/**
 * Which old priced unit stands for each pick until the list is repriced, as the leading run that still matches the draft.
 * A pick with no match further on that copies an earlier one exactly, as a duplicate does, borrows that unit so the cards
 * after it stay; any other ends the run, since later cards may describe different picks.
 */
export function survivingUnits(previous: unknown, current: readonly RosterPick[]): number[] | null {
  if (!Array.isArray(previous)) return null
  const kept: number[] = []
  let at = 0
  for (const pick of current) {
    let found = at
    while (found < previous.length && !samePick(previous[found], pick)) found++
    if (found < previous.length) {
      kept.push(found)
      at = found + 1
      continue
    }
    const earlier = previous.findIndex((unit) => sameLoadout(unit, pick))
    if (earlier === -1) break
    kept.push(earlier)
  }
  return kept
}
