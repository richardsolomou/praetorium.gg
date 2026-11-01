import type { Datasheet } from './datasheet'

export const datasheetFixture = (overrides: Partial<Datasheet> = {}): Datasheet => ({
  id: 'unit',
  slug: 'unit',
  referenceRoute: null,
  name: 'Unit',
  points: null,
  keywords: [],
  profiles: [],
  abilities: [],
  composition: [],
  loadout: null,
  wargearOptions: [],
  baseSize: null,
  transport: null,
  costs: [],
  attachments: [],
  leaders: [],
  supporters: [],
  keywordRules: [],
  ...overrides,
})
