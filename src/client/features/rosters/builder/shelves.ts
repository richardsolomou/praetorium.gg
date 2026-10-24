import { attachedUnitList } from '../../../../core/attachedUnits'
import type { UnitGroup } from '../../../../core/unitGroups'
import { GROUPS } from '../../../unitGroups'

/** How the roster list arranges its cards: one per datasheet, or one block per attached unit. */
export type ShelfArrangement = 'role' | 'attached'

type ShelfCard = { key: string | number; attachedTo?: string | number; attaches?: 'leader' | 'support'; group: UnitGroup; name: string }

const roleOrder = (group: UnitGroup) => GROUPS.findIndex((shelf) => shelf.id === group)

/** Characters lead units, so a list reads its characters first, then the units they joined, then the rest. */
const ATTACHED_AFTER: UnitGroup = 'character'

/**
 * The roster's shelves, each entry the cards of one unit in the order they are drawn,
 * and each count the datasheets on it.
 *
 * By role, every datasheet is its own entry on its role's shelf. Attached together, the
 * datasheets of each attached unit leave their role shelves for one Attached units shelf,
 * each unit read as it is played: leaders first, then support, then the unit they joined.
 */
export function rosterShelves<C extends ShelfCard>(cards: readonly C[], arrangement: ShelfArrangement) {
  const byName = (left: C[], right: C[]) => left[0]!.name.localeCompare(right[0]!.name)
  const units =
    arrangement === 'attached'
      ? attachedUnitList(cards).map(({ host, joined }) => [
          ...joined.filter((card) => card.attaches !== 'support'),
          ...joined.filter((card) => card.attaches === 'support'),
          host,
        ])
      : cards.map((card) => [card])
  const attached = units
    .filter((members) => members.length > 1)
    .toSorted((left, right) => roleOrder(left[0]!.group) - roleOrder(right[0]!.group) || byName(left, right))
  const shelf = (id: string, plural: string, entries: C[][]) =>
    entries.length ? [{ id, plural, count: entries.reduce((total, members) => total + members.length, 0), entries }] : []
  return GROUPS.flatMap(({ id, plural }) => [
    ...shelf(id, plural, units.filter((members) => members.length === 1 && members[0]!.group === id).toSorted(byName)),
    ...(id === ATTACHED_AFTER ? shelf('attached', 'Attached units', attached) : []),
  ])
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
