import type { FormatRuleId, OptionalRuleId, Secondary, Stratagem } from '../../../core/battle'
import type { RosterPick } from '../../../core/roster'
import type { RosterSource, RosterVisibility } from '../../../core/savedRoster'
import { withoutUnitNotes } from '../../../core/unitNotes'
import type { exportRoster, saveRoster } from '../../functions'
import { annotatedPicks } from './rosterPicks'

/** A list exactly as the builder's autosave sends it. */
export type RosterDraft = Parameters<typeof saveRoster>[0]['data']

type SavedRoster = {
  id: string
  name: string
  automaticName?: boolean
  catalogueId: string
  detachmentIds: string[]
  disposition: string | null
  limit: number
  pointsBudget?: number | null
  picks: readonly RosterPick[]
  waivedRules: FormatRuleId[]
  optionalRules?: OptionalRuleId[]
  borrowedDetachmentId?: string | null
  visibility: RosterVisibility
  source: RosterSource
}

type SavedPrep = {
  stratagems: Stratagem[]
  secondaries: Secondary[]
  remindersEnabled?: boolean
}

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
    name: roster.automaticName ? '' : roster.name.trim(),
    catalogueId: roster.catalogueId,
    detachmentIds: roster.detachmentIds,
    disposition: roster.disposition,
    limit: roster.limit,
    pointsBudget: roster.pointsBudget ?? null,
    picks: annotatedPicks(roster.picks),
    prep: {
      stratagems: prep.stratagems,
      secondaries: prep.secondaries,
      remindersEnabled: prep.remindersEnabled ?? true,
    },
    waivedRules: roster.waivedRules,
    optionalRules: roster.optionalRules ?? [],
    borrowedDetachmentId: roster.borrowedDetachmentId ?? null,
    visibility: roster.visibility,
    source: roster.source,
  }
}

type ExportedRoster = Pick<SavedRoster, 'catalogueId' | 'detachmentIds' | 'disposition' | 'limit' | 'pointsBudget' | 'picks'> & {
  waivedRules?: FormatRuleId[]
}

/** What "Export text" sends, whether the builder or the library asks. */
export const exportInput = (roster: ExportedRoster, name: string): Parameters<typeof exportRoster>[0]['data'] => ({
  catalogueId: roster.catalogueId,
  detachmentIds: roster.detachmentIds,
  disposition: roster.disposition,
  limit: roster.limit,
  pointsBudget: roster.pointsBudget,
  name,
  units: withoutUnitNotes(roster.picks),
  waivedRules: roster.waivedRules,
})
