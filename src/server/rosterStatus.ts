import { changesTouching, type ListContents, type RecordedChangeSet } from '../core/catalogueChanges'
import { uniqueNames } from './pricing'
import { rosterUseProblem } from './rosterUsage'

type PricedList = Parameters<typeof rosterUseProblem>[0] & {
  units: readonly { enhancements: readonly string[]; upgrades: readonly string[] }[]
}

export type RosterVerdict = { problem: 'over-limit' | 'not-legal' | null; contents: ListContents }

/**
 * Whether a saved list is legal under the data the instance holds now, and what it holds
 * that a data update can reach.
 *
 * The datasheets come from the picks, so one the data no longer builds is still counted
 * as held; the enhancements come from the price, because only pricing reads a choice as
 * one. A list that could not be priced is judged nothing rather than legal.
 */
export function rosterVerdict(
  roster: { catalogueId: string; detachmentIds: readonly string[]; limit: number; picks: readonly { entryId: string }[] },
  priced: PricedList | null,
): RosterVerdict {
  return {
    problem: priced ? (rosterUseProblem(priced, roster.limit)?.kind ?? null) : null,
    contents: {
      catalogueId: roster.catalogueId,
      detachmentIds: [...roster.detachmentIds],
      datasheetIds: [...new Set(roster.picks.map((pick) => pick.entryId))],
      enhancements: uniqueNames(priced?.units.flatMap((unit) => unit.enhancements) ?? []),
      upgrades: uniqueNames(priced?.units.flatMap((unit) => unit.upgrades) ?? []),
    },
  }
}

/**
 * What the library row says about a list: its verdict, and how many things the data
 * updates since its save changed on balance. The count is the banner's own fold, so a
 * list the library calls changed always has a banner that names what changed.
 */
export function rosterStatus(roster: { id: string; updatedAt: number }, verdict: RosterVerdict, sets: readonly RecordedChangeSet[]) {
  return { id: roster.id, problem: verdict.problem, changes: changesTouching(verdict.contents, roster.updatedAt, sets).length }
}
