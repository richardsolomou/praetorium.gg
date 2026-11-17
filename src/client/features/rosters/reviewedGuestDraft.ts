import { requireReviewedRoster } from '../../offline/reviewedRoster'
import { type GuestDraft, readGuestDraft, writeGuestDraft } from './guestDraft'
import type { RosterDraft } from './rosterDraft'

// Apart from the guest draft store, which the shell reads, because the review compares rosters by their full schema.

/** Keeps a reviewed setup change, refused when another tab changed the list after the review began. */
export function keepReviewedDraft(guest: GuestDraft, { id: _id, ...draft }: RosterDraft, source: RosterDraft) {
  const latest = readGuestDraft()
  requireReviewedRoster(latest?.id === guest.id ? latest.draft : null, { ...source, id: undefined })
  return writeGuestDraft({ ...guest, draft, updatedAt: Date.now() })
}
