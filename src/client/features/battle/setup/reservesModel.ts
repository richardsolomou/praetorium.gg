import { attachedUnitList, type AttachedUnit } from '../../../../core/attachedUnits'
import type { Army } from '../../../sides'
import { GROUPS } from '../../../unitGroups'

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

export function reserveUnitLabel(units: AttachedUnit<Army['units'][number]>[], unit: AttachedUnit<Army['units'][number]>): string {
  const named = units.filter((entry) => entry.host.name === unit.host.name)
  const name = named.length > 1 ? `${unit.host.name} #${named.findIndex((entry) => entry.host.key === unit.host.key) + 1}` : unit.host.name
  return unit.joined.length ? `${name} with ${unit.joined.map((entry) => entry.name).join(', ')}` : name
}
