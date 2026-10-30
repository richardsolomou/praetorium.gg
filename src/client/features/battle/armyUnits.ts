import type { UnitState } from '../../../core/battle'
import { frozenAttaches, rosterShelves } from '../rosters/builder/shelves'

/**
 * An army on the shelves a roster is read by, with the units it has lost set aside.
 *
 * The same shelves, order, and attached units as the roster, so an army is found the
 * same way mid-battle as it was while it was being written. A destroyed unit leaves its
 * shelf rather than sitting on it greyed out: what is left on the table is the question
 * this list is read to answer, and a leader whose bodyguard is gone stands alone.
 *
 * `leads` says whether this list's Warlord leads its side, since allies field one between them.
 */
export function armyShelves(units: readonly UnitState[], leads: boolean) {
  return rosterShelves(
    units
      .filter((unit) => !unit.destroyed)
      .map((unit) => ({
        unit,
        key: unit.key,
        attachedTo: unit.attachedTo,
        attaches: frozenAttaches(unit.joined),
        group: unit.group ?? 'other',
        name: unit.name,
        warlord: leads && unit.warlord === true,
      })),
    'attached',
  )
}
