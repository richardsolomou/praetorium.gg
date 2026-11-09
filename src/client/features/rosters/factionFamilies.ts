import { currentCatalogueFamilyId } from '../../../core/retiredCatalogueIds'

/** One entry per faction, named by its current rules where it has them, whatever versions its lists use. */
export function factionFamilies<T extends { id: string; isDefault?: boolean }>(factions: readonly T[]) {
  const families = new Map<string, T>()
  for (const faction of factions) {
    const family = currentCatalogueFamilyId(faction.id)
    const known = families.get(family)
    if (!known || (faction.isDefault && !known.isDefault)) families.set(family, faction)
  }
  return [...families].map(([family, faction]) => ({ ...faction, family }))
}
