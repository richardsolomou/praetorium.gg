export const UNIT_GROUPS = [
  'epic-hero',
  'character',
  'battleline',
  'infantry',
  'swarm',
  'mounted',
  'beast',
  'monster',
  'vehicle',
  'drone',
  'transport',
  'fortification',
  'other',
] as const

export type UnitGroup = (typeof UNIT_GROUPS)[number]
