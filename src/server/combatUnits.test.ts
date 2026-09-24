import { expect, it } from 'vitest'
import { points, shelfOf } from './catalogue.fixtures'
import { combatUnitsFor } from './combatUnits'

it('builds the simulator unit index for every faction', () => {
  const loaded = shelfOf(
    {
      name: 'Necrons',
      selectionEntries: [{ id: 'warriors', name: 'Necron Warriors', type: 'unit', costs: points(100) }],
    },
    {
      name: 'Orks',
      selectionEntries: [{ id: 'boyz', name: 'Boyz', type: 'unit', costs: points(80) }],
    },
  )

  expect(combatUnitsFor(loaded, null)).toEqual([
    { catalogueId: 'cat', name: 'Necrons', units: [{ id: 'warriors', name: 'Necron Warriors', points: 100 }] },
    { catalogueId: 'cat-1', name: 'Orks', units: [{ id: 'boyz', name: 'Boyz', points: 80 }] },
  ])
})
