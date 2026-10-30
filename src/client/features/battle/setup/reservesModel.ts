import { attachedUnitList, type AttachedUnit } from '../../../../core/attachedUnits'
import { transportLabel } from '../../../../core/battle'
import { nicknamedUnit } from '../../../../core/unitNotes'
import type { Army } from '../../../sides'
import { shelvesOf } from '../../../unitGroups'

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
  const ordered = shelvesOf(attached, (unit) => unit.host.group).flatMap((shelf) => shelf.units)
  const deepStrike = ordered.filter((unit) => unit.formationOptions.includes('deep-strike'))
  const strategicReserves = ordered.filter((unit) => !unit.formationOptions.includes('deep-strike'))

  return [
    ...(deepStrike.length ? [{ label: 'Deep strike', units: deepStrike }] : []),
    ...(strategicReserves.length ? [{ label: 'Strategic reserves', units: strategicReserves }] : []),
  ]
}

export function reserveUnitLabel(units: AttachedUnit<Army['units'][number]>[], unit: AttachedUnit<Army['units'][number]>): string {
  const name =
    transportLabel(
      units.map((entry) => entry.host),
      unit.host.key,
    ) ?? unit.host.name
  return unit.joined.length ? `${name} with ${unit.joined.map((entry) => nicknamedUnit(entry.name, entry.nickname)).join(', ')}` : name
}
