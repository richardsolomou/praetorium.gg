import { rulesVersionDetails, type CatalogueEdition } from './catalogueEdition'
import { currentCatalogueFamilyId, savedCatalogueIds, savedDetachmentIds } from './retiredCatalogueIds'
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

/** The saved IDs a page can hold for this filter, or null when no rules version in the index matches it. */
export function discoveryScope(filter: RosterDiscoveryFilter, factions: readonly IndexedFaction[]) {
  const catalogueIds =
    filter.faction || filter.rules
      ? factions
          .filter(
            (faction) =>
              (!filter.faction || currentCatalogueFamilyId(faction.id) === filter.faction) &&
              (!filter.rules || rulesVersionStatus(faction) === filter.rules),
          )
          .map((faction) => faction.id)
      : null
  if (catalogueIds && !catalogueIds.length) return null
  return {
    catalogueIds: catalogueIds && savedCatalogueIds(catalogueIds),
    detachmentIds: filter.detachment ? savedDetachmentIds([filter.detachment]) : null,
  }
}

/** Whether a roster, read against current IDs, is inside the filter. */
export function inDiscoveryScope(
  roster: { catalogueId: string; detachmentIds: readonly string[] },
  filter: RosterDiscoveryFilter,
  factions: ReadonlyMap<string, IndexedFaction>,
) {
  const faction = factions.get(roster.catalogueId)
  return (
    (!filter.faction || currentCatalogueFamilyId(roster.catalogueId) === filter.faction) &&
    (!filter.rules || (faction !== undefined && rulesVersionStatus(faction) === filter.rules)) &&
    (!filter.detachment || roster.detachmentIds.includes(filter.detachment))
  )
}
