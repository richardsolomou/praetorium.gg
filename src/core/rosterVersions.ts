import { canonicalJson } from './text'
import type { RosterContent } from './rosterLock'

/**
 * A save this long after the one before it starts a new sitting. The builder saves on every pause, so keeping a
 * version per save would bury the lists a player took to the table; keeping the list each sitting left behind does not.
 */
export const ROSTER_VERSION_GAP_MS = 60 * 60 * 1000

/** The most earlier versions a roster keeps; the oldest goes first. */
export const ROSTER_VERSIONS_KEPT = 20

/** What a version holds of a list: its army, not its name or the cards and alerts a player prepared for it. */
const armyOf = (content: RosterContent) =>
  canonicalJson({
    catalogueId: content.catalogueId,
    detachmentIds: content.detachmentIds,
    disposition: content.disposition ?? null,
    limit: content.limit,
    pointsBudget: content.pointsBudget ?? null,
    picks: content.picks,
    waivedRules: content.waivedRules ?? [],
    optionalRules: content.optionalRules ?? [],
    borrowedDetachmentId: content.borrowedDetachmentId ?? null,
  })

/** Whether a save replaces a list worth keeping: one a sitting at least a gap ago left, whose army the save changes. */
export function keepsRosterVersion(stored: RosterContent, storedAt: number, next: RosterContent, now: number) {
  return now - storedAt >= ROSTER_VERSION_GAP_MS && armyOf(stored) !== armyOf(next)
}
