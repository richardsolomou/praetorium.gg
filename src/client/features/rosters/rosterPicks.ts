import type { RosterPick } from '../../../core/roster'

/**
 * A pick while a list is being edited.
 *
 * `key` is this session's own numbering, which is what tells two copies of the same
 * datasheet apart while the player moves them around. It never leaves the browser.
 */
export type KeyedPick = RosterPick & { key: number }

/**
 * A pick in the one shape every construction call reads.
 *
 * Written out field by field rather than spread, because the shape is also the
 * pricing cache key: a route prefetching a saved list and the builder editing it
 * have to produce the same object or the page refetches what it was just given.
 * Notes change nothing a price reads, so typing one must not reprice.
 */
export const normalisePicks = (picks: readonly RosterPick[]): RosterPick[] =>
  picks.map(({ entryId, catalogueId, models, choices, spreads, toggles, attachedTo }) => ({
    entryId,
    catalogueId,
    models,
    choices,
    spreads,
    toggles,
    attachedTo,
  }))

/** The construction shape with the player's note, as a saved row keeps it. */
export const annotatedPicks = (picks: readonly RosterPick[]): RosterPick[] =>
  normalisePicks(picks).map((pick, at) => ({ ...pick, note: picks[at]?.note }))

/** Session keys resolved to the positions a saved list counts in. */
const withPositions = (picks: readonly KeyedPick[]): RosterPick[] =>
  picks.map((pick) => {
    if (pick.attachedTo === undefined) return pick
    const at = picks.findIndex((candidate) => candidate.key === pick.attachedTo)
    return { ...pick, attachedTo: at < 0 ? undefined : at }
  })

export const positionedPicks = (picks: readonly KeyedPick[]): RosterPick[] => normalisePicks(withPositions(picks))
export const positionedAnnotatedPicks = (picks: readonly KeyedPick[]): RosterPick[] => annotatedPicks(withPositions(picks))
