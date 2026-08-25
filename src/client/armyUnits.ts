import type { UnitState } from '../core/battle'
import { GROUPS } from './components/builder/groups'

/** The models an army still has on the table, out of the ones it brought. */
export function armyModels(units: readonly UnitState[]) {
  return {
    standing: units.reduce((total, unit) => total + unit.alive, 0),
    total: units.reduce((total, unit) => total + unit.models, 0),
  }
}

/**
 * An army on the shelves a roster is read by, with the units it has lost set aside.
 *
 * The same shelves and the same order as the library and the picker, so an army is
 * found the same way mid-battle as it was while it was being written. A destroyed
 * unit leaves its shelf rather than sitting on it greyed out: what is left on the
 * table is the question this list is read to answer.
 */
export function armyShelves(units: readonly UnitState[]) {
  const standing = units.filter((unit) => !unit.destroyed)
  return GROUPS.flatMap(({ id, plural }) => {
    const shelf = standing.filter((unit) => (unit.group ?? 'other') === id)
    return shelf.length ? [{ id, plural, units: shelf }] : []
  })
}
