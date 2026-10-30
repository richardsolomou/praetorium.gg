import type { UnitGroup } from '../core/unitGroups'

/** The shelves a datasheet can sit on, in the order a roster is read. */
export const GROUPS: { id: UnitGroup; plural: string }[] = [
  { id: 'epic-hero', plural: 'Epic heroes' },
  { id: 'character', plural: 'Characters' },
  { id: 'battleline', plural: 'Battleline' },
  { id: 'infantry', plural: 'Infantry' },
  { id: 'swarm', plural: 'Swarms' },
  { id: 'mounted', plural: 'Mounted' },
  { id: 'beast', plural: 'Beasts' },
  { id: 'monster', plural: 'Monsters' },
  { id: 'vehicle', plural: 'Vehicles' },
  { id: 'drone', plural: 'Drones' },
  { id: 'transport', plural: 'Dedicated transports' },
  { id: 'fortification', plural: 'Fortifications' },
  { id: 'other', plural: 'Other datasheets' },
]

/** Items on the shelves they sit on, in roster order and without empty shelves; an item with no group sits on the last. */
export function shelvesOf<T>(items: readonly T[], groupOf: (item: T) => UnitGroup | null | undefined) {
  return GROUPS.flatMap(({ id, plural }) => {
    const units = items.filter((item) => (groupOf(item) ?? 'other') === id)
    return units.length ? [{ id, plural, units }] : []
  })
}
