import { attachedUnitList } from '../../../core/attachedUnits'
import type { Army } from '../../sides'
import { GROUPS } from '../builder/groups'

/**
 * The army as this step asks about it: the units it is played as, deep strike first.
 *
 * A character and the unit he joined arrive together, so they are one row, kept on the
 * shelf the joined unit sits on. Which section it belongs in is decided by what the
 * whole unit can do rather than by the character's own datasheet, because deep strike
 * asks that every model in the unit has the ability.
 */
export function reserveSections(units: Army['units']) {
  const attached = attachedUnitList(units)
  const ordered = GROUPS.flatMap((group) => attached.filter((unit) => (unit.host.group ?? 'other') === group.id))
  const deepStrike = ordered.filter((unit) => unit.formationOptions.includes('deep-strike'))
  const strategicReserves = ordered.filter((unit) => !unit.formationOptions.includes('deep-strike'))

  return [
    ...(deepStrike.length ? [{ label: 'Deep strike', units: deepStrike }] : []),
    ...(strategicReserves.length ? [{ label: 'Strategic reserves', units: strategicReserves }] : []),
  ]
}
