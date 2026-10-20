import { currentCatalogueFamilyId } from './retiredCatalogueIds'

/** Armies whose every roster the player has archived, which they have most likely stopped playing. */
export function archivedArmies(rosters: readonly { catalogueId: string; archived: boolean }[]) {
  const active = new Set(rosters.flatMap((roster) => (roster.archived ? [] : [currentCatalogueFamilyId(roster.catalogueId)])))
  return new Set(rosters.map((roster) => currentCatalogueFamilyId(roster.catalogueId)).filter((army) => !active.has(army)))
}
