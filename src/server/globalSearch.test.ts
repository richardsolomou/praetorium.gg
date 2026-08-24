import { describe, expect, it } from 'vitest'
import { categories, points, shelfOf } from './catalogue.fixtures'
import { searchEverything } from './globalSearch'
import type { LoadedRules } from './rules'

describe('global datasheet search', () => {
  it('finds a datasheet by structured metadata and explains the match', async () => {
    const catalogue = shelfOf({
      name: 'Necrons',
      categoryEntries: [{ id: 'cryptek', name: 'Cryptek' }],
      selectionEntries: [
        {
          id: 'technomancer',
          name: 'Technomancer',
          type: 'model',
          costs: points(85),
          categoryLinks: [
            { id: 'faction', targetId: 'necrons', name: 'Faction: Necrons' },
            { id: 'cryptek-link', targetId: 'cryptek', name: 'Cryptek' },
          ],
        },
      ],
    })

    const results = await searchEverything('cryptek', { catalogue, rules: null, own: async () => null })

    expect(results.filter((result) => result.group === 'Datasheets')).toEqual([
      expect.objectContaining({
        label: 'Technomancer',
        detail: 'Necrons',
        matchReasons: [{ kind: 'keyword', value: 'Cryptek' }],
      }),
    ])
  })

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

  it('shows generic Heretic Astartes datasheets under Chaos Space Marines once', async () => {
    const catalogue = shelfOf(
      {
        name: 'Chaos - Chaos Space Marines',
        selectionEntries: [
          {
            id: 'chaos-lord',
            name: 'Chaos Lord',
            type: 'model',
            costs: points(90),
            categoryLinks: categories('Faction: Heretic Astartes'),
          },
        ],
      },
      {
        name: 'Chaos - World Eaters',
        selectionEntries: [
          {
            id: 'world-eaters-chaos-lord',
            name: 'Chaos Lord',
            type: 'model',
            costs: points(90),
            categoryLinks: categories('Faction: Heretic Astartes'),
          },
        ],
      },
    )

    const results = await searchEverything('chaos lord', { catalogue, rules: null, own: async () => null })
    expect(results.filter((result) => result.group === 'Datasheets')).toEqual([
      expect.objectContaining({ label: 'Chaos Lord', detail: 'Chaos Space Marines' }),
    ])
  })

  it('offers a close datasheet match only when no direct datasheet match exists', async () => {
    const catalogue = shelfOf({
      name: 'Space Marines',
      selectionEntries: [
        { id: 'chaplain', name: 'Chaplain in Terminator Armour', type: 'model', costs: points(75) },
        { id: 'captain', name: 'Captain in Terminator Armour', type: 'model', costs: points(95) },
      ],
    })

    const typo = await searchEverything('terminator chaplin', { catalogue, rules: null, own: async () => null })
    expect(typo.filter((result) => result.group === 'Datasheets')).toEqual([
      expect.objectContaining({ label: 'Chaplain in Terminator Armour', fuzzy: true }),
    ])

    const direct = await searchEverything('chaplain', { catalogue, rules: null, own: async () => null })
    expect(direct.filter((result) => result.group === 'Datasheets')).toEqual([
      expect.objectContaining({ label: 'Chaplain in Terminator Armour' }),
    ])
    expect(direct.find((result) => result.group === 'Datasheets')?.fuzzy).toBeUndefined()
  })

  it('uses faction rules rather than the imported catalogue to place detachments', async () => {
    const catalogue = shelfOf(
      {
        name: 'Space Marines',
        selectionEntries: [{ id: 'marine', name: 'Space Marine', type: 'unit', costs: points(20) }],
        sharedSelectionEntries: [
          {
            id: 'detachment-wrapper',
            name: 'Detachment',
            type: 'upgrade',
            selectionEntryGroups: [
              {
                id: 'detachment-choices',
                name: 'Detachment',
                selectionEntries: [
                  { id: 'black-spear', name: 'Black Spear Task Force', type: 'upgrade' },
                  { id: 'first-company', name: '1st Company Task Force', type: 'upgrade' },
                ],
              },
            ],
          },
        ],
      },
      {
        name: 'Deathwatch',
        selectionEntries: [{ id: 'watch-master', name: 'Watch Master', type: 'model', costs: points(95) }],
        catalogueLinks: [{ targetId: 'cat', importRootEntries: true }],
      },
      {
        name: 'Imperial Fists',
        selectionEntries: [{ id: 'fist-captain', name: 'Captain', type: 'model', costs: points(80) }],
        catalogueLinks: [{ targetId: 'cat', importRootEntries: true }],
      },
    )
    const rules = {
      factionKeys: new Map([
        ['space-marines', 'space-marines'],
        ['deathwatch', 'deathwatch'],
        ['imperial-fists', 'imperial-fists'],
      ]),
      detachmentReferences: new Map([
        [
          'space-marines',
          new Map([['1st-company-task-force', { enhancements: 0, upgrades: 0, stratagems: 0, points: null, dispositions: [] }]]),
        ],
        [
          'deathwatch',
          new Map([
            ['black-spear-task-force', { enhancements: 0, upgrades: 0, stratagems: 0, points: null, dispositions: [] }],
            ['1st-company-task-force', { enhancements: 0, upgrades: 0, stratagems: 0, points: null, dispositions: [] }],
          ]),
        ],
        [
          'imperial-fists',
          new Map([['1st-company-task-force', { enhancements: 0, upgrades: 0, stratagems: 0, points: null, dispositions: [] }]]),
        ],
      ]),
      detachmentDetails: new Map(),
      factionNames: new Map(),
      factionIcons: new Map(),
      factionRules: new Map(),
      factionRuleCards: new Map(),
      dispositions: new Map(),
      missions: new Map(),
      primaries: [],
      secondaries: [],
      deployments: [],
      attribution: '',
    } as Partial<LoadedRules> as LoadedRules
    catalogue.factionContents.set('deathwatch', {
      datasheets: new Set(),
      datasheetDetails: new Map(),
      detachments: new Set(['Black Spear Task Force']),
      armyRules: [],
    })

    const results = await searchEverything('black spear', { catalogue, rules, own: async () => null })
    expect(results.filter((result) => result.group === 'Detachments')).toEqual([
      expect.objectContaining({
        label: 'Black Spear Task Force',
        detail: 'Deathwatch',
        href: '/factions/deathwatch/reference/detachments/black-spear-task-force',
      }),
    ])

    const shared = await searchEverything('1st company', { catalogue, rules, own: async () => null })
    expect(shared.filter((result) => result.group === 'Detachments')).toEqual([
      expect.objectContaining({ label: '1st Company Task Force', detail: 'Space Marines' }),
    ])
  })
})
