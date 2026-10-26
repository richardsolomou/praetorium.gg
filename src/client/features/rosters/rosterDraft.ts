import type { FormatRuleId, OptionalRuleId, Secondary, Stratagem } from '../../../core/battle'
import type { RosterPick } from '../../../core/roster'
import type { RosterSource, RosterVisibility } from '../../../core/savedRoster'
import { withoutUnitNotes } from '../../../core/unitNotes'
import type { exportRoster, saveRoster } from '../../functions'
import { annotatedPicks } from './rosterPicks'
import type { RosterSetup } from './RosterSetupDialog'

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
  waivedRules?: FormatRuleId[]
  optionalRules?: OptionalRuleId[]
  borrowedDetachmentId?: string | null
  visibility?: RosterVisibility
  source: RosterSource
}

type SavedPrep = {
  stratagems: Stratagem[]
  secondaries: Secondary[]
  remindersEnabled?: boolean
}

/** The battle preparation of a list that has none yet. */
export const NO_PREP: SavedPrep = { stratagems: [], secondaries: [], remindersEnabled: true }

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
  return rosterDraftOf(rosterSetupOf(roster), {
    id: roster.id,
    picks: annotatedPicks(roster.picks),
    prep: { stratagems: prep.stratagems, secondaries: prep.secondaries, remindersEnabled: prep.remindersEnabled ?? true },
    source: roster.source,
  })
}

/** A list's setup as the setup dialog edits it, where a name the list was given automatically reads as none. */
export const rosterSetupOf = (roster: Omit<SavedRoster, 'id' | 'picks' | 'source'>): RosterSetup => ({
  name: roster.automaticName ? '' : roster.name,
  catalogueId: roster.catalogueId,
  detachmentIds: roster.detachmentIds,
  disposition: roster.disposition,
  limit: roster.limit,
  pointsBudget: roster.pointsBudget ?? null,
  waivedRules: roster.waivedRules ?? [],
  optionalRules: roster.optionalRules ?? [],
  borrowedDetachmentId: roster.borrowedDetachmentId ?? null,
  visibility: roster.visibility ?? 'private',
})

/** A setup with the rest of a save, in the key order `draftKey` compares. */
export const rosterDraftOf = (
  setup: RosterSetup,
  list: { id?: string; picks: RosterDraft['picks']; prep: RosterDraft['prep']; source: RosterSource },
): RosterDraft => ({
  id: list.id,
  name: setup.name.trim(),
  catalogueId: setup.catalogueId,
  detachmentIds: setup.detachmentIds,
  disposition: setup.disposition,
  limit: setup.limit,
  pointsBudget: setup.pointsBudget,
  picks: list.picks,
  prep: list.prep,
  waivedRules: setup.waivedRules,
  optionalRules: setup.optionalRules,
  borrowedDetachmentId: setup.borrowedDetachmentId,
  visibility: setup.visibility,
  source: list.source,
})

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
