import type { UnitState } from '../../../core/battle'
import { shelvesOf } from '../../unitGroups'

/**
 * An army on the shelves a roster is read by, with the units it has lost set aside.
 *
 * The same shelves and the same order as the library and the picker, so an army is
 * found the same way mid-battle as it was while it was being written. A destroyed
 * unit leaves its shelf rather than sitting on it greyed out: what is left on the
 * table is the question this list is read to answer.
 */
export function armyShelves(units: readonly UnitState[]) {
  return shelvesOf(
    units.filter((unit) => !unit.destroyed),
    (unit) => unit.group,
  )
}
