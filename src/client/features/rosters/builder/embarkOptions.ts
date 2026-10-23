import { canTransport } from '../../../../core/battle'
import type { UnitGroup } from '../../../../core/unitGroups'
import { nicknamedUnit } from '../../../../core/unitNotes'
import type { KeyedPick } from '../rosterPicks'

type PricedUnit = { name: string; group: UnitGroup; transport?: boolean }

/**
 * The transports the unit at `index` can be listed as starting in, or null when it
 * cannot start in one: a joined unit rides with its host, and a transport cannot
 * embark. Capacity is not judged here; attaching the list to a battle applies the
 * transport's rule and leaves out a unit that does not fit.
 */
export function embarkOptions(
  picks: readonly KeyedPick[],
  units: readonly (PricedUnit | undefined)[],
  index: number,
): { key: number; label: string }[] | null {
  const unit = units[index]
  if (!unit || picks[index]?.attachedTo !== undefined || canTransport(unit)) return null
  const transports = picks.flatMap((pick, at) => {
    const transport = units[at]
    return at !== index && transport && pick.attachedTo === undefined && canTransport(transport) ? [{ pick, name: transport.name }] : []
  })
  return transports.map(({ pick, name }) => {
    const named = transports.filter((candidate) => candidate.name === name)
    const numbered = named.length > 1 ? `${name} #${named.findIndex((candidate) => candidate.pick === pick) + 1}` : name
    return { key: pick.key, label: pick.nickname ? nicknamedUnit(name, pick.nickname) : numbered }
  })
}
