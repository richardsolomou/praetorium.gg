import { rulesVersionDetails, type CatalogueEdition } from './catalogueEdition'
import { currentCatalogueFamilyId, savedCatalogueIds, savedDetachmentIds } from './retiredCatalogueIds'
import { facetActive, facetMatches } from './listFilter'
import type { RosterDiscoveryFilter, RulesVersionStatus } from './rosterDiscovery'

type IndexedFaction = {
  id: string
  edition?: Pick<CatalogueEdition, 'name' | 'status' | 'description'> | null
  rulesName?: string
  isDefault?: boolean
}

export function rulesVersionStatus(faction: IndexedFaction): RulesVersionStatus | null {
  const { status } = rulesVersionDetails(faction)
  return status === 'Current' ? 'current' : status === 'Archived' ? 'archived' : status === 'Preview' ? 'preview' : null
}

type ArmyFilter = Pick<RosterDiscoveryFilter, 'faction' | 'detachment' | 'rules'>

/** The saved IDs a page can hold for this filter, or null when no rules version in the index matches it. */
export function discoveryScope(filter: ArmyFilter, factions: readonly IndexedFaction[]) {
  const inScope = (faction: IndexedFaction) =>
    facetMatches(filter.faction, [currentCatalogueFamilyId(faction.id)]) && facetMatches(filter.rules, [rulesVersionStatus(faction) ?? ''])
  const catalogueIds =
    facetActive(filter.faction) || facetActive(filter.rules) ? factions.filter(inScope).map((faction) => faction.id) : null
  if (catalogueIds && !catalogueIds.length) return null
  return {
    catalogueIds: catalogueIds && savedCatalogueIds(catalogueIds),
    detachmentIds: filter.detachment?.in.length ? savedDetachmentIds([...filter.detachment.in]) : null,
    excludedDetachmentIds: filter.detachment?.out.length ? savedDetachmentIds([...filter.detachment.out]) : [],
  }
}

/** Whether a roster, read against current IDs, is inside the filter. */
export function inDiscoveryScope(
  roster: { catalogueId: string; detachmentIds: readonly string[] },
  filter: ArmyFilter,
  factions: ReadonlyMap<string, IndexedFaction>,
) {
  const faction = factions.get(roster.catalogueId)
  return (
    facetMatches(filter.faction, [currentCatalogueFamilyId(roster.catalogueId)]) &&
    facetMatches(filter.rules, faction ? [rulesVersionStatus(faction) ?? ''] : []) &&
    facetMatches(filter.detachment, roster.detachmentIds)
  )
}
