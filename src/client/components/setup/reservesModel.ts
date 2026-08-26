import type { Army } from '../../sides'
import { GROUPS } from '../builder/groups'

export function reserveSections(units: Army['units']) {
  const ordered = GROUPS.flatMap((group) => units.filter((unit) => (unit.group ?? 'other') === group.id))
  const deepStrike = ordered.filter((unit) => unit.formationOptions?.includes('deep-strike'))
  const strategicReserves = ordered.filter((unit) => !unit.formationOptions?.includes('deep-strike'))

  return [
    ...(deepStrike.length ? [{ label: 'Deep strike', units: deepStrike }] : []),
    ...(strategicReserves.length ? [{ label: 'Strategic reserves', units: strategicReserves }] : []),
  ]
}
