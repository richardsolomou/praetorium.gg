import { expect, it } from 'vitest'
import { prepareReferenceSearch, searchReference, type GlobalSearchIndex } from './referenceSearch'

const datasheet = (name: string) => ({
  targetId: name,
  allied: false,
  name,
  fields: { name, keywords: ['Infantry'], abilities: [], weapons: [], weaponKeywords: [], wargear: [] },
  result: {
    id: `datasheet:${name}`,
    group: 'Datasheets' as const,
    label: name,
    detail: 'Necrons',
    href: `/factions/necrons/datasheets/${name}`,
  },
})
const index = (count: number): GlobalSearchIndex => ({
  factions: [],
  detachments: [],
  datasheets: Array.from({ length: count }, (_, at) => datasheet(`Warrior ${at}`)),
  missions: [],
  rules: [],
})

it('prepares a large index in idle-sized slices', () => {
  expect([...prepareReferenceSearch(index(450))]).toHaveLength(2)
})

it('finds the same results after preparing the index', () => {
  const prepared = index(3)
  const before = searchReference('warrior 2', index(3))
  for (const _ of prepareReferenceSearch(prepared));
  expect(searchReference('warrior 2', prepared)).toEqual(before)
})
