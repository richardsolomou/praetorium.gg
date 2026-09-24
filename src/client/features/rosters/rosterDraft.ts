import type { FormatRuleId, OptionalRuleId, Secondary, Stratagem } from '../../../core/battle'
import type { RosterReminder } from '../../../core/reminders'
import type { RosterPick } from '../../../core/roster'
import type { RosterSource, RosterVisibility } from '../../../core/savedRoster'
import type { saveRoster } from '../../../server/functions'
import { normalisePicks } from '../../rosterPicks'

/** A list exactly as the builder's autosave sends it. */
export type RosterDraft = Parameters<typeof saveRoster>[0]['data']

type SavedRoster = {
  id: string
  name: string
  catalogueId: string
  detachmentIds: string[]
  disposition: string | null
  limit: number
  picks: readonly RosterPick[]
  waivedRules: FormatRuleId[]
  optionalRules?: OptionalRuleId[]
  borrowedDetachmentId?: string | null
  visibility: RosterVisibility
  source: RosterSource
}

type SavedPrep = { stratagems: Stratagem[]; secondaries: Secondary[]; reminders?: RosterReminder[]; remindersEnabled?: boolean }

/** Two drafts that would save the same row compare equal. */
export const draftKey = (draft: RosterDraft) => JSON.stringify(draft)

/**
 * What a saved list's row already says, in the shape a save of it would send.
 *
 * The autosave compares against this, so opening a list is not an edit: saving an
 * unchanged list would move `updatedAt`, which the library prints and which is the
 * line data updates are measured from. A list the builder rewrites as it loads, such
 * as an attachment pointing at a unit that is no longer there, differs and is saved.
 */
export function savedDraft(roster: SavedRoster, prep: SavedPrep): RosterDraft {
  return {
    id: roster.id,
    name: roster.name.trim(),
    catalogueId: roster.catalogueId,
    detachmentIds: roster.detachmentIds,
    disposition: roster.disposition,
    limit: roster.limit,
    picks: normalisePicks(roster.picks),
    prep: {
      stratagems: prep.stratagems,
      secondaries: prep.secondaries,
      reminders: prep.reminders ?? [],
      remindersEnabled: prep.remindersEnabled ?? true,
    },
    waivedRules: roster.waivedRules,
    optionalRules: roster.optionalRules ?? [],
    borrowedDetachmentId: roster.borrowedDetachmentId ?? null,
    visibility: roster.visibility,
    source: roster.source,
  }
}
