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
 * Nicknames, notes and starting embarks change nothing a price reads, so editing one must not reprice.
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

/** The construction shape with the player's nickname, note and starting embark, as a saved row keeps it. */
export const annotatedPicks = (picks: readonly RosterPick[]): RosterPick[] =>
  normalisePicks(picks).map((pick, at) => ({
    ...pick,
    embarkedIn: picks[at]?.embarkedIn,
    nickname: picks[at]?.nickname,
    note: picks[at]?.note,
  }))

/** Session keys resolved to the positions a saved list counts in. */
const withPositions = (picks: readonly KeyedPick[]): RosterPick[] => {
  const position = (key: number | undefined) => {
    const at = key === undefined ? -1 : picks.findIndex((candidate) => candidate.key === key)
    return at < 0 ? undefined : at
  }
  return picks.map((pick) =>
    pick.attachedTo === undefined && pick.embarkedIn === undefined
      ? pick
      : { ...pick, attachedTo: position(pick.attachedTo), embarkedIn: position(pick.embarkedIn) },
  )
}

export const positionedPicks = (picks: readonly KeyedPick[]): RosterPick[] => normalisePicks(withPositions(picks))
export const positionedAnnotatedPicks = (picks: readonly KeyedPick[]): RosterPick[] => annotatedPicks(withPositions(picks))
