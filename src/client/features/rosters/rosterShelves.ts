import { attachedUnitList } from '../../../core/attachedUnits'
import type { UnitGroup } from '../../../core/unitGroups'
import { GROUPS } from '../../unitGroups'

/** Whether the roster list draws a card per datasheet or a block per attached unit. */
export type RosterView = 'datasheets' | 'units'

type Card = { key: string | number; attachedTo?: string | number; group: UnitGroup; unit: { name: string; points: number } }

/** One entry on a shelf: a datasheet alone, or an attached unit with the characters that joined it. */
export type ShelfEntry<T> = { host: T; joined: T[]; points: number }

/**
 * The roster's role shelves, each holding datasheets or the attached units they form.
 *
 * Grouping by unit is the fold battles count by, so a block stays on its bodyguard's
 * shelf, under the bodyguard's name, and the shelf counts it once.
 */
export function rosterShelves<T extends Card>(cards: readonly T[], view: RosterView) {
  const entries = view === 'units' ? attachedUnitList(cards) : cards.map((card) => ({ host: card, joined: [] as T[] }))
  return GROUPS.flatMap(({ id, plural }) => {
    const shelf = entries
      .filter(({ host }) => host.group === id)
      .toSorted((left, right) => left.host.unit.name.localeCompare(right.host.unit.name))
      .map(({ host, joined }): ShelfEntry<T> => ({
        host,
        joined,
        points: [host, ...joined].reduce((sum, card) => sum + card.unit.points, 0),
      }))
    return shelf.length ? [{ id, plural, entries: shelf }] : []
  })
}
