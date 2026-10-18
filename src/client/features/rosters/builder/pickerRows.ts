import { matchSearchText } from '../../../../core/datasheetSearch'
import type { RosterPick } from '../../../../core/roster'

/** A saved loadout as this roster would take it; `points` is undefined while it is being priced. */
export type PickerLoadout = { id: string; name: string; pick: RosterPick; points?: number | null }

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
 * too, and a search for its own name brings its datasheet along. Loadouts whose datasheet the book
 * does not offer are returned apart, so the picker can say why rather than drop them.
 */
export function pickerRows<U extends { id: string; points: number | null }>({ units, found, loadouts, query, keeps }: Options<U>) {
  const searched = new Set(found.map((unit) => unit.id))
  const offered = new Set(units.map((unit) => unit.id))
  const listed = (loadout: PickerLoadout) =>
    (!query.trim() || searched.has(loadout.pick.entryId) || matchSearchText(query, loadout.name) !== null) &&
    keeps(loadout.pick.entryId, loadout.points)
  const byUnit = new Map<string, PickerLoadout[]>()
  const unavailable: PickerLoadout[] = []
  for (const loadout of loadouts.filter(listed)) {
    if (!offered.has(loadout.pick.entryId)) unavailable.push(loadout)
    else byUnit.set(loadout.pick.entryId, [...(byUnit.get(loadout.pick.entryId) ?? []), loadout])
  }
  const shown = found.filter((unit) => byUnit.has(unit.id) || keeps(unit.id, unit.points))
  const shownIds = new Set(shown.map((unit) => unit.id))
  return {
    units: [...shown, ...units.filter((unit) => byUnit.has(unit.id) && !shownIds.has(unit.id))],
    loadouts: byUnit as ReadonlyMap<string, PickerLoadout[]>,
    unavailable,
  }
}
