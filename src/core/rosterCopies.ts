import type { RosterPick } from './roster'
import { currentCatalogueFamilyId, currentRosterIds, picksForRulesVersion } from './retiredCatalogueIds'
import type { UnitLoadout } from './unitLoadouts'
import { withoutUnitNotes } from './unitNotes'

/** Units copied into a roster of `catalogueId`, without their owner's notes and moved to its rules version as a conversion moves them. */
export const copiedPicks = (picks: readonly RosterPick[], catalogueId: string): RosterPick[] =>
  picksForRulesVersion(withoutUnitNotes(picks), catalogueId)

/**
 * A loadout as new units of a roster, its own unit first, or nothing when the roster is another army's.
 * A joined unit's `attachedTo` is the position of the unit it joins within the result.
 *
 * Choices the destination does not offer stay in the pick, so the roster's own pricing reports
 * them for reselection rather than the copy dropping them unseen.
 */
export function loadoutPicks(loadout: Pick<UnitLoadout, 'catalogueId' | 'pick' | 'joined'>, catalogueId: string): RosterPick[] | null {
  if (currentCatalogueFamilyId(loadout.catalogueId) !== currentCatalogueFamilyId(catalogueId)) return null
  const saved = [loadout.pick, ...(loadout.joined ?? [])].map((pick) => ({ ...pick, catalogueId: loadout.catalogueId }))
  return copiedPicks(saved, catalogueId).map((copy) => ({ ...copy, catalogueId }))
}

/**
 * A fielded army as the setup of a new roster, without its player's notes.
 *
 * It keeps the rules version it was fielded under, read against current IDs as every saved roster
 * is, so the builder reports what that version no longer allows and offers conversion itself.
 */
export function copiedArmy<
  T extends { catalogueId: string; detachmentIds: readonly string[]; picks: readonly RosterPick[]; playedAt?: number },
>(army: T): T & { picks: RosterPick[] } {
  // A fielded army was last changed when it was played, so its plain book ID resolves as a roster saved then would.
  const { updatedAt: _updatedAt, ...current } = currentRosterIds({ ...army, picks: withoutUnitNotes(army.picks), updatedAt: army.playedAt })
  return { ...(current as unknown as T), picks: [...current.picks] }
}
