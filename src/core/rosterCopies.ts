import type { RosterPick } from './roster'
import { currentCatalogueFamilyId, currentRosterIds, picksForRulesVersion } from './retiredCatalogueIds'
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

/**
 * A fielded army as the setup of a new roster, without its player's notes.
 *
 * It keeps the rules version it was fielded under, read against current IDs as every saved roster
 * is, so the builder reports what that version no longer allows and offers conversion itself.
 */
export function copiedArmy<T extends { catalogueId: string; detachmentIds: readonly string[]; picks: readonly RosterPick[] }>(
  army: T,
): T & { picks: RosterPick[] } {
  const current = currentRosterIds({ ...army, picks: withoutUnitNotes(army.picks) })
  return { ...current, picks: [...current.picks] }
}
