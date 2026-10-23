import { canTransport, transportLabel } from '../../../../core/battle'
import type { UnitGroup } from '../../../../core/unitGroups'
import { nicknamedUnit } from '../../../../core/unitNotes'
import type { KeyedPick } from '../rosterPicks'

type PricedUnit = { name: string; group: UnitGroup; transport?: boolean }

/**
 * The transports the unit at `index` can be listed as starting in, numbered as battle
 * setup numbers them. None for a joined unit, which rides with its host, or for a
 * transport. Capacity is not judged here; attaching the list to a battle applies the
 * transport's rule and leaves out a unit that does not fit.
 */
export function embarkOptions(
  picks: readonly KeyedPick[],
  units: readonly (PricedUnit | undefined)[],
  index: number,
): { key: number; label: string }[] {
  const unit = units[index]
  if (!unit || picks[index]?.attachedTo !== undefined || canTransport(unit)) return []
  const named = picks.map((pick, at) => ({ key: pick.key, name: units[at]?.name ?? '' }))
  return picks.flatMap((pick, at) => {
    const transport = units[at]
    if (at === index || !transport || pick.attachedTo !== undefined || !canTransport(transport)) return []
    return [{ key: pick.key, label: pick.nickname ? nicknamedUnit(transport.name, pick.nickname) : transportLabel(named, pick.key)! }]
  })
}
