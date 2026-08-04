/** The shelves a datasheet can sit on, in the order a roster is read. */
export type UnitGroup = 'character' | 'battleline' | 'transport' | 'other'

export const GROUPS: { id: UnitGroup; singular: string; plural: string; empty: string }[] = [
  { id: 'character', singular: 'Character', plural: 'Characters', empty: 'No characters' },
  { id: 'battleline', singular: 'Battleline', plural: 'Battleline', empty: 'No battleline' },
  { id: 'transport', singular: 'Dedicated transport', plural: 'Dedicated transport', empty: 'No transports' },
  { id: 'other', singular: 'Other datasheet', plural: 'Other datasheets', empty: 'No units' },
]
