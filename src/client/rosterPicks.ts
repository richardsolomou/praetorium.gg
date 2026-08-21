import type { RosterPick } from '../core/roster'

/**
 * A pick while a list is being edited.
 *
 * `key` is this session's own numbering, which is what tells two copies of the same
 * datasheet apart while the player moves them around. It never leaves the browser.
 */
export type KeyedPick = RosterPick & { key: number }

/**
 * A pick in the one shape every server call reads.
 *
 * Written out field by field rather than spread, because the shape is also the
 * pricing cache key: a route prefetching a saved list and the builder editing it
 * have to produce the same object or the page refetches what it was just given.
 */
export const normalisePicks = (picks: readonly RosterPick[]): RosterPick[] =>
  picks.map(({ entryId, catalogueId, models, choices, spreads, swaps, toggles, attachedTo }) => ({
    entryId,
    catalogueId,
    models,
    choices,
    spreads,
    swaps,
    toggles,
    attachedTo,
  }))

/** The same shape, with session keys resolved to the positions a saved list counts in. */
export const positionedPicks = (picks: readonly KeyedPick[]): RosterPick[] =>
  normalisePicks(
    picks.map((pick) => {
      if (pick.attachedTo === undefined) return pick
      const at = picks.findIndex((candidate) => candidate.key === pick.attachedTo)
      return { ...pick, attachedTo: at < 0 ? undefined : at }
    }),
  )
