import type { UnitGroup } from '../../../core/unitGroups'

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
