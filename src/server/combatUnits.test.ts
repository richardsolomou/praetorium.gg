import { expect, it } from 'vitest'
import { categories, points, shelfOf } from './catalogue.fixtures'
import { combatUnitsFor } from './combatUnits'
import { searchEverything } from './globalSearch'

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

it('lists a shared datasheet once under its owning faction', () => {
  const loaded = shelfOf(
    {
      name: 'Space Marines',
      selectionEntries: [{ id: 'intercessors', name: 'Intercessor Squad', type: 'unit', costs: points(80) }],
    },
    { name: 'Black Templars', catalogueLinks: [{ targetId: 'cat', importRootEntries: true }] },
    { name: 'Blood Angels', catalogueLinks: [{ targetId: 'cat', importRootEntries: true }] },
  )

  expect(combatUnitsFor(loaded, null).flatMap((book) => book.units.map((unit) => [book.name, unit.id]))).toEqual([
    ['Space Marines', 'intercessors'],
  ])
})

it('keeps an imported datasheet when its defining book is unavailable as a faction', () => {
  const loaded = shelfOf(
    { name: 'Source', selectionEntries: [{ id: 'imported', name: 'Imported Unit', type: 'unit', costs: points(80) }] },
    { name: 'Host', catalogueLinks: [{ targetId: 'cat', importRootEntries: true }] },
  )
  loaded.factions = loaded.factions.filter((faction) => faction.name === 'Host')

  expect(combatUnitsFor(loaded, null).flatMap((book) => book.units.map((unit) => [book.name, unit.id]))).toEqual([['Host', 'imported']])
})

it('honours a written faction over the defining book', () => {
  const loaded = shelfOf(
    {
      name: 'Source',
      selectionEntries: [
        { id: 'host-unit', name: 'Host Unit', type: 'unit', costs: points(80), categoryLinks: categories('Faction: Host') },
      ],
    },
    { name: 'Host', catalogueLinks: [{ targetId: 'cat', importRootEntries: true }] },
  )

  expect(combatUnitsFor(loaded, null).flatMap((book) => book.units.map((unit) => [book.name, unit.id]))).toEqual([['Host', 'host-unit']])
})

it('keeps datasheets with multiple written factions available to each faction', () => {
  const loaded = shelfOf(
    {
      name: 'Source',
      selectionEntries: [
        {
          id: 'shared',
          name: 'Shared Unit',
          type: 'unit',
          costs: points(80),
          categoryLinks: categories('Faction: Source', 'Faction: Host'),
        },
      ],
    },
    { name: 'Host', catalogueLinks: [{ targetId: 'cat', importRootEntries: true }] },
  )

  expect(combatUnitsFor(loaded, null).flatMap((book) => book.units.map((unit) => [book.name, unit.id]))).toEqual([
    ['Host', 'shared'],
    ['Source', 'shared'],
  ])
})

it('keeps simulator choices and global search aligned for imported and distinct datasheets', async () => {
  const loaded = shelfOf(
    {
      name: 'Space Marines',
      selectionEntries: [
        { id: 'intercessors', name: 'Intercessor Squad', type: 'unit', costs: points(80) },
        { id: 'sternguard', name: 'Sternguard Veteran Squad', type: 'unit', costs: points(100) },
      ],
    },
    {
      name: 'Black Templars',
      selectionEntries: [{ id: 'templar-sternguard', name: 'Sternguard Veteran Squad', type: 'unit', costs: points(85) }],
      catalogueLinks: [{ targetId: 'cat', importRootEntries: true }],
    },
    { name: 'Blood Angels', catalogueLinks: [{ targetId: 'cat', importRootEntries: true }] },
  )
  const simulator = combatUnitsFor(loaded, null)
  const results = await Promise.all(
    ['Intercessor Squad', 'Sternguard Veteran Squad'].map((query) =>
      searchEverything(query, { catalogue: loaded, rules: null, own: async () => null }),
    ),
  )
  const factionsIn = (name: string) => simulator.flatMap((book) => book.units.filter((unit) => unit.name === name).map(() => book.name))
  const matches = (found: Awaited<ReturnType<typeof searchEverything>>, name: string) =>
    found.filter((result) => result.group === 'Datasheets' && result.label === name).map((result) => result.detail)

  expect({
    intercessors: [factionsIn('Intercessor Squad'), matches(results[0]!, 'Intercessor Squad')],
    sternguard: [factionsIn('Sternguard Veteran Squad'), matches(results[1]!, 'Sternguard Veteran Squad')],
  }).toEqual({
    intercessors: [['Space Marines'], ['Space Marines']],
    sternguard: [
      ['Black Templars', 'Space Marines'],
      ['Black Templars', 'Space Marines'],
    ],
  })
})
