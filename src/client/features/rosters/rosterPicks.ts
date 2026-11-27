import type { RosterPick } from '../../../core/roster'
import { withHeldVs } from '../../../core/savedPicks'

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
const construction = ({ entryId, catalogueId, models, choices, spreads, toggles, attachedTo, floor, vs }: RosterPick): RosterPick => ({
  entryId,
  catalogueId,
  models,
  choices,
  spreads,
  toggles,
  attachedTo,
  floor,
  vs,
})

/** Each pick as it is priced and shown: a translation it was served stands in for the `vs` it lacks. */
export const normalisePicks = (picks: readonly RosterPick[]): RosterPick[] => picks.map((pick) => construction(withHeldVs(pick)))

/**
 * The construction shape with the player's nickname, note and starting embark, as a saved row keeps it. A save of the
 * list's content keeps a translation each pick was served as its own `vs`: it is the owner's own list, as they were
 * served it, so the list reads the same once the save dates it past the copy the translations read.
 */
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
