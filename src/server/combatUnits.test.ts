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

it('lists imported chapter units under their owning faction', () => {
  const loaded = shelfOf(
    {
      name: 'Space Marines',
      selectionEntries: [{ id: 'sternguard', name: 'Sternguard Veteran Squad', type: 'unit', costs: points(100) }],
    },
    {
      name: 'Black Templars',
      selectionEntries: [{ id: 'templar-sternguard', name: 'Sternguard Veteran Squad', type: 'unit', costs: points(110) }],
      catalogueLinks: [{ targetId: 'cat', importRootEntries: true }],
    },
  )

  expect(combatUnitsFor(loaded, null).flatMap((book) => book.units.map((unit) => [book.name, unit.id]))).toEqual([
    ['Black Templars', 'templar-sternguard'],
    ['Space Marines', 'sternguard'],
  ])
})

it('keeps imported units available for chapter rules when only one book owns their datasheet', () => {
  const loaded = shelfOf(
    {
      name: 'Space Marines',
      selectionEntries: [{ id: 'intercessors', name: 'Intercessor Squad', type: 'unit', costs: points(80) }],
    },
    { name: 'Black Templars', catalogueLinks: [{ targetId: 'cat', importRootEntries: true }] },
  )

  expect(combatUnitsFor(loaded, null).flatMap((book) => book.units.map((unit) => [book.name, unit.id]))).toEqual([
    ['Black Templars', 'intercessors'],
    ['Space Marines', 'intercessors'],
  ])
})
