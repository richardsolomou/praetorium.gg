import { currentCatalogueFamilyId } from './retiredCatalogueIds'

type RulesFaction = { id: string; isDefault?: boolean; edition?: { status: string } | null }

/** The current rules for a roster's army when the roster keeps another version; a preview is a deliberate choice, not an older one. */
export function currentRulesFor<T extends RulesFaction>(catalogueId: string, factions: readonly T[]): T | null {
  const own = factions.find((faction) => faction.id === catalogueId)
  if (!own || own.isDefault !== false || own.edition?.status === 'preview') return null
  const family = currentCatalogueFamilyId(catalogueId)
  return (
    factions.find((faction) => faction.isDefault && faction.id !== catalogueId && currentCatalogueFamilyId(faction.id) === family) ?? null
  )
}
