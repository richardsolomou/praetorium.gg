import { changesTouching, type ListContents, type RecordedChangeSet } from '../core/catalogueChanges'
import { uniqueNames } from './pricing'
import { rosterUseProblem } from './rosterUsage'

type PricedList = Parameters<typeof rosterUseProblem>[0] & {
  units: readonly { key: number; size: { models: number }; enhancements: readonly string[]; upgrades: readonly string[] }[]
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
  roster: {
    catalogueId: string
    detachmentIds: readonly string[]
    limit: number
    waivedRules?: readonly string[]
    picks: readonly { entryId: string }[]
  },
  priced: PricedList | null,
): RosterVerdict {
  const modelsByPick = new Map(priced?.units.map((unit) => [unit.key, unit.size.models] as const) ?? [])
  return {
    problem: priced ? (rosterUseProblem(priced, roster.limit, roster.waivedRules)?.kind ?? null) : null,
    contents: {
      catalogueId: roster.catalogueId,
      detachmentIds: [...roster.detachmentIds],
      datasheets: roster.picks.map((pick, key) => ({ id: pick.entryId, models: modelsByPick.get(key) ?? null })),
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

/** Only a selected option needs pricing to decide whether its recorded change reaches a list. */
export function rosterChangeWithoutPricing(
  roster: Parameters<typeof rosterVerdict>[0] & { updatedAt: number },
  sets: readonly RecordedChangeSet[],
): 'changed' | 'needs-price' | 'unchanged' {
  const potential = changesTouching(rosterVerdict(roster, null).contents, roster.updatedAt, sets, { includeUnknownModels: true })
  if (
    potential.some(
      ({ change }) => change.kind !== 'datasheet-points' || change.rows.every((row) => row.models === null && row.condition === null),
    )
  )
    return 'changed'
  if (potential.length) return 'needs-price'
  const detachments = new Set(roster.detachmentIds)
  return sets.some(
    (set) =>
      set.recordedAt > roster.updatedAt &&
      set.changes.factions.some(
        (faction) =>
          faction.catalogueId === roster.catalogueId &&
          faction.changes.some((change) => 'detachmentId' in change && detachments.has(change.detachmentId)),
      ),
  )
    ? 'needs-price'
    : 'unchanged'
}
