import { groupBy } from '../../../../core/collections'
import { matchSearchText } from '../../../../core/datasheetSearch'
import type { NonMatchedPlayKind } from '../../../../core/name'
import type { RosterPick } from '../../../../core/roster'

/** Legends and Crucible datasheets stay out of every new-unit offer until the picker's chip for them is on. */
export const shownKind = (kind: NonMatchedPlayKind | undefined, active: ReadonlySet<string>) => !kind || active.has(kind)

/**
 * A saved loadout as this roster would take it, its own unit first and any attached units after;
 * `points` is undefined while it is being priced.
 */
export type PickerLoadout = { id: string; name: string; picks: readonly [RosterPick, ...RosterPick[]]; points?: number | null }

export const isAttachedUnit = (loadout: Pick<PickerLoadout, 'picks'>) => loadout.picks.length > 1

export const loadoutNoun = (loadout: Pick<PickerLoadout, 'picks'> | null) =>
  loadout && isAttachedUnit(loadout) ? 'attached unit' : 'loadout'

type Options<U> = {
  /** The whole book, so a loadout found by its own name can still show its datasheet. */
  units: readonly U[]
  /** The book narrowed by the search, in its ranked order. */
  found: readonly U[]
  loadouts: readonly PickerLoadout[]
  query: string
  /** The picker's filters, asked with a loadout's own points and otherwise as of its datasheet. */
  keeps: (entryId: string, points: number | null | undefined) => boolean
}

/**
 * What the picker lists: datasheets, each with the saved loadouts it holds.
 *
 * A loadout stands in for its datasheet, so a search or filter that keeps the datasheet keeps it
 * too, and a search for its own name brings its datasheet along. Loadouts with a datasheet the book
 * does not offer are returned apart, so the picker can say why rather than drop them.
 */
export function pickerRows<U extends { id: string; points: number | null }>({ units, found, loadouts, query, keeps }: Options<U>) {
  const searched = new Set(found.map((unit) => unit.id))
  const offered = new Set(units.map((unit) => unit.id))
  const listed = (loadout: PickerLoadout) =>
    (!query.trim() || searched.has(loadout.picks[0].entryId) || matchSearchText(query, loadout.name) !== null) &&
    keeps(loadout.picks[0].entryId, loadout.points)
  const kept = loadouts.filter(listed)
  const available = (loadout: PickerLoadout) => loadout.picks.every((pick) => offered.has(pick.entryId))
  const byUnit = groupBy(kept.filter(available), (loadout) => loadout.picks[0].entryId)
  const unavailable = kept.filter((loadout) => !available(loadout))
  const shown = found.filter((unit) => byUnit.has(unit.id) || keeps(unit.id, unit.points))
  const shownIds = new Set(shown.map((unit) => unit.id))
  return {
    units: [...shown, ...units.filter((unit) => byUnit.has(unit.id) && !shownIds.has(unit.id))],
    loadouts: byUnit as ReadonlyMap<string, PickerLoadout[]>,
    unavailable,
  }
}
