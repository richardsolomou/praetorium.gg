import type { RosterPick } from './roster'
import { currentCatalogueFamilyId, picksForRulesVersion } from './retiredCatalogueIds'
import type { UnitLoadout } from './unitLoadouts'
import { withoutUnitNotes } from './unitNotes'

/** Units copied into a roster of `catalogueId`, without their owner's notes and moved to its rules version as a conversion moves them. */
export const copiedPicks = (picks: readonly RosterPick[], catalogueId: string): RosterPick[] =>
  picksForRulesVersion(withoutUnitNotes(picks), catalogueId)

/**
 * A loadout as a new unit of a roster, or nothing when the roster is another army's.
 *
 * Choices the destination does not offer stay in the pick, so the roster's own pricing reports
 * them for reselection rather than the copy dropping them unseen.
 */
export function loadoutPick(loadout: Pick<UnitLoadout, 'catalogueId' | 'pick'>, catalogueId: string): RosterPick | null {
  if (currentCatalogueFamilyId(loadout.catalogueId) !== currentCatalogueFamilyId(catalogueId)) return null
  const [copy] = copiedPicks([{ ...loadout.pick, catalogueId: loadout.catalogueId }], catalogueId)
  return copy ? { ...copy, catalogueId } : null
}
