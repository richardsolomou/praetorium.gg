import { attachedUnitList } from '../../../../core/attachedUnits'
import type { UnitGroup } from '../../../../core/unitGroups'
import { GROUPS } from '../../../unitGroups'

/** How the roster list arranges its cards: one per datasheet, or one block per attached unit. */
export type ShelfArrangement = 'role' | 'attached'

type ShelfCard = { key: string | number; attachedTo?: string | number; attaches?: 'leader' | 'support'; group: UnitGroup; name: string }

/**
 * The roster's shelves, each entry the cards of one unit in the order they are drawn,
 * and each count the units on it.
 *
 * By role, every datasheet is its own entry on its role's shelf. Attached together, each
 * attached unit sits on the shelf of the unit its leaders and support joined, drawn as
 * that unit, then its leaders, then its support.
 */
export function rosterShelves<C extends ShelfCard>(cards: readonly C[], arrangement: ShelfArrangement) {
  const units =
    arrangement === 'attached'
      ? attachedUnitList(cards).map(({ host, joined }) => [
          host,
          ...joined.filter((card) => card.attaches !== 'support'),
          ...joined.filter((card) => card.attaches === 'support'),
        ])
      : cards.map((card) => [card])
  return GROUPS.flatMap(({ id, plural }) => {
    const entries = units
      .filter((members) => members[0]!.group === id)
      .toSorted((left, right) => left[0]!.name.localeCompare(right[0]!.name))
    return entries.length ? [{ id, plural, count: entries.length, entries }] : []
  })
}

const JOINED_AS: Record<string, string> = { Leading: 'Leader', Supporting: 'Support' }

/**
 * A card's attachment rows inside an attached unit's block: just the role each joined
 * datasheet plays, with its Remove. The unit it joined is drawn beside it, and the
 * bodyguard's own rows would repeat its leaders' Remove as Detach.
 */
export function unitRoleRows<R extends { label: string; name: string }>(rows: readonly R[]): R[] {
  return rows.flatMap((row) => (JOINED_AS[row.label] ? [{ ...row, label: JOINED_AS[row.label]!, name: '' }] : []))
}
