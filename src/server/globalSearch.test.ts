import { describe, expect, it } from 'vitest'
import { categories, points, shelfOf } from './catalogue.fixtures'
import { searchEverything } from './globalSearch'

describe('global datasheet search', () => {
  it('shows a shared allied datasheet under its native faction once', async () => {
    const catalogue = shelfOf(
      {
        name: 'Adeptus Mechanicus',
        selectionEntries: [
          { id: 'skitarii', name: 'Skitarii', type: 'unit', costs: points(10), categoryLinks: categories('Faction: Adeptus Mechanicus') },
        ],
        catalogueLinks: [{ targetId: 'cat-1', importRootEntries: true }],
      },
      {
        name: 'Agents of the Imperium',
        selectionEntries: [
          {
            id: 'callidus',
            name: 'Callidus Assassin',
            type: 'model',
            costs: points(100),
            categoryLinks: categories('Faction: Agents of the Imperium'),
          },
        ],
      },
    )

    const results = await searchEverything('callidus', { catalogue, rules: null, own: async () => null })
    expect(results.filter((result) => result.group === 'Datasheets')).toEqual([
      expect.objectContaining({ label: 'Callidus Assassin', detail: 'Agents of the Imperium' }),
    ])
  })

  it('shows generic Adeptus Astartes datasheets under Space Marines once', async () => {
    const catalogue = shelfOf(
      {
        name: 'Space Marines',
        selectionEntries: [
          {
            id: 'chaplain',
            name: 'Chaplain in Terminator Armour',
            type: 'model',
            costs: points(75),
            categoryLinks: categories('Faction: Adeptus Astartes'),
          },
        ],
      },
      {
        name: 'Black Templars',
        selectionEntries: [
          {
            id: 'black-templars-chaplain',
            name: 'Chaplain in Terminator Armour',
            type: 'model',
            costs: points(75),
            categoryLinks: categories('Faction: Adeptus Astartes'),
          },
        ],
      },
      {
        name: 'Blood Angels',
        selectionEntries: [
          {
            id: 'blood-angels-chaplain',
            name: 'Chaplain in Terminator Armour',
            type: 'model',
            costs: points(75),
            categoryLinks: categories('Faction: Adeptus Astartes'),
          },
        ],
      },
    )

    const results = await searchEverything('chaplain in terminator', { catalogue, rules: null, own: async () => null })
    expect(results.filter((result) => result.group === 'Datasheets')).toEqual([
      expect.objectContaining({ label: 'Chaplain in Terminator Armour', detail: 'Space Marines' }),
    ])
  })
})
