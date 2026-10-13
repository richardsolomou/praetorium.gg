import { describe, expect, it } from 'vitest'
import { categories, points, shelfOf } from './catalogue.fixtures'
import { compiledGlobalSearchIndex, searchEverything } from './globalSearch'
import type { LoadedRules } from './rules'
import type { RuleDocument } from './rulesCore'

it('links preview search results through the stable faction path', () => {
  const catalogue = shelfOf({
    id: 'custodes-11e~book',
    name: 'Adeptus Custodes',
    selectionEntries: [{ id: 'guard', name: 'Custodian Guard', type: 'unit', costs: points(240) }],
  })
  catalogue.edition = {
    id: 'custodes-11e',
    name: 'Custodes codex',
    status: 'preview',
    default: false,
    catalogueIds: ['book'],
    releases: [{ at: 1, status: 'preview' }],
  }
  const index = compiledGlobalSearchIndex(catalogue, null)
  expect([...index.factions, ...index.datasheets].map((entry) => entry.result.href)).toEqual([
    '/factions/adeptus-custodes/rules/custodes-11e',
    '/factions/adeptus-custodes/rules/custodes-11e/datasheets/custodian-guard',
  ])
})

describe('global datasheet search', () => {
  it('does not attribute a generic faction rule effect to every unit', async () => {
    const catalogue = shelfOf({
      name: 'Necrons',
      rules: [{ id: 'army-rule', name: 'Army rule', description: 'You gain 1 CP.' }],
      selectionEntries: [
        {
          id: 'warrior',
          name: 'Warrior',
          type: 'model',
          costs: points(10),
          infoLinks: [{ id: 'army-rule-link', targetId: 'army-rule', name: 'Army rule', type: 'rule' }],
        },
      ],
    })
    const results = await searchEverything('gain 1cp', { catalogue, rules: null, own: async () => null })
    expect(results.filter((result) => result.group === 'Datasheets')).toEqual([])
  })
  it('returns every matching datasheet beyond the former twelve-result cap', async () => {
    const catalogue = shelfOf({
      name: 'Necrons',
      selectionEntries: Array.from({ length: 60 }, (_, index) => ({
        id: `unit-${index}`,
        name: `Guard ${index}`,
        type: 'model' as const,
        costs: points(10),
      })),
    })
    const results = await searchEverything('guard', { catalogue, rules: null, own: async () => null })
    expect(results.filter((result) => result.group === 'Datasheets')).toHaveLength(60)
  })
  it('finds command-phase CP generators through the compiled ability description', async () => {
    const catalogue = shelfOf({
      name: 'Necrons',
      selectionEntries: [
        {
          id: 'strategist',
          name: 'Strategist',
          type: 'model',
          costs: points(100),
          profiles: [
            {
              id: 'grand-strategist',
              name: 'Grand Strategist',
              typeName: 'Abilities',
              characteristics: [{ name: 'Description', $text: 'You gain 1 CP in your Command phase.' }],
            },
          ],
        },
      ],
    })
    const results = await searchEverything('gain 1cp command phase', {
      catalogue: null,
      catalogueIndex: compiledGlobalSearchIndex(catalogue, null),
      rules: null,
      own: async () => null,
    })
    expect(results.filter((result) => result.group === 'Datasheets').map(({ label, matchReasons }) => ({ label, matchReasons }))).toEqual([
      { label: 'Strategist', matchReasons: [{ kind: 'ability', value: 'Grand Strategist' }] },
    ])
  })
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
      ruleDocuments: [],
      attribution: '',
    } as Partial<LoadedRules> as LoadedRules
    catalogue.factionContents.set('deathwatch', {
      name: 'Deathwatch',
      datasheets: new Set(),
      datasheetDetails: new Map(),
      datasheetIds: new Map(),
      detachments: new Set(['Black Spear Task Force']),
      enhancements: new Map(),
      stratagems: new Map(),
      stratagemIssues: [],
      detachmentRules: new Map(),
      armyRules: [],
      factionAbilityNames: new Set(),
    })
    rules.detachmentDetails.set('deathwatch', new Map())
    rules.detachmentDetails.get('deathwatch')!.set('black-spear-task-force', {
      id: 'black-spear',
      name: 'Black Spear Task Force',
      points: null,
      dispositions: [],
      rules: [{ name: 'Masterful Tactics', description: 'You gain 1 CP in your Command phase.' }],
      upgrades: [{ name: 'Veteran Training', points: 10, description: null }],
      enhancements: [
        {
          name: 'Superior Creation',
          points: 25,
          description: 'The bearer can declare a charge even if it Advanced this turn.',
          eligibility: null,
        },
      ],
      stratagems: [
        {
          id: 'stratagem',
          name: 'Unyielding Sentinels',
          cp: 1,
          type: null,
          phases: [],
          turn: null,
          description: 'Each time a model is destroyed, that model can fight before it is removed.',
        },
      ],
    })

    for (const query of ['superior creation', 'unyielding sentinels', 'veteran training']) {
      const matches = await searchEverything(query, {
        catalogue: null,
        catalogueIndex: compiledGlobalSearchIndex(catalogue, rules),
        rules,
        own: async () => null,
      })
      expect(matches.filter((result) => result.group === 'Detachments').map((result) => result.href)).toEqual([
        '/factions/deathwatch/detachments/black-spear-task-force',
      ])
    }

    for (const [query, kind, value] of [
      ['masterful tactics', 'detachment rule', 'Masterful Tactics'],
      ['gain 1cp', 'detachment rule', 'Masterful Tactics'],
      ['advance and charge', 'enhancement', 'Superior Creation'],
      ['fight on death', 'stratagem', 'Unyielding Sentinels'],
    ]) {
      const matches = await searchEverything(query!, { catalogue, rules, own: async () => null })
      expect(matches.filter((result) => result.group === 'Detachments')).toEqual([
        expect.objectContaining({ label: 'Black Spear Task Force', matchReasons: [{ kind, value }] }),
      ])
    }
    for (const query of ['gain 2cp', 'advance fight death']) {
      expect(
        (await searchEverything(query, { catalogue, rules, own: async () => null })).filter((result) => result.group === 'Detachments'),
      ).toEqual([])
    }

    const results = await searchEverything('black spear', { catalogue, rules, own: async () => null })
    expect(results.filter((result) => result.group === 'Detachments')).toEqual([
      expect.objectContaining({
        label: 'Black Spear Task Force',
        detail: 'Deathwatch',
        href: '/factions/deathwatch/detachments/black-spear-task-force',
      }),
    ])

    const shared = await searchEverything('1st company', { catalogue, rules, own: async () => null })
    expect(shared.filter((result) => result.group === 'Detachments')).toEqual([
      expect.objectContaining({ label: '1st Company Task Force', detail: 'Space Marines' }),
    ])
  })
})

describe('global rules search', () => {
  const ruleDocuments: RuleDocument[] = [
    {
      id: 'core-rules-document',
      slug: 'core-rules',
      title: 'Core Rules',
      updated: null,
      sections: [
        {
          id: 'section-moving',
          slug: 'moving',
          title: '03. Moving',
          entries: [{ id: 'entry', code: '03.01', anchor: '03.01', title: 'Moving Units', blocks: [], facts: [], cost: null, lore: null }],
        },
      ],
    },
  ]
  const rules = {
    ruleDocuments,
    missions: new Map(),
    primaries: [],
    secondaries: [],
    deployments: [],
    attribution: '',
  } as Partial<LoadedRules> as LoadedRules

  it('finds a rule by name and links to where it is printed', async () => {
    const results = await searchEverything('moving units', { catalogue: null, rules, own: async () => null })
    expect(results.filter((result) => result.group === 'Rules')).toEqual([
      expect.objectContaining({ label: 'Moving Units', detail: '03.01 · Core Rules', href: '/rules/core-rules/moving#03.01' }),
    ])
  })

  it('finds a rule by the number another rule quotes it as', async () => {
    const results = await searchEverything('03.01', { catalogue: null, rules, own: async () => null })
    expect(results.filter((result) => result.group === 'Rules').map((result) => result.label)).toEqual(['Moving Units'])
  })

  it('searches compiled rules without loading the rules source', async () => {
    const catalogueIndex = {
      factions: [],
      detachments: [],
      datasheets: [],
      missions: [],
      rules: [
        {
          search: '03.01 moving units',
          result: {
            id: 'rule:core-rules:03.01',
            group: 'Rules' as const,
            label: 'Moving Units',
            detail: '03.01 · Core Rules',
            href: '/rules/core-rules/moving#03.01',
          },
        },
      ],
    }
    const results = await searchEverything('moving units', { catalogue: null, catalogueIndex, rules: null, own: async () => null })
    expect(results.map((result) => result.id)).toEqual(['rule:core-rules:03.01'])
  })
})

describe('global mission search', () => {
  it('finds a force disposition by name and links to its page', async () => {
    const rules = {
      missions: new Map(),
      primaries: [],
      secondaries: [],
      deployments: [],
      dispositionDetails: [{ id: 'take-and-hold', name: 'Take and Hold', text: null }],
      ruleDocuments: [],
      attribution: '',
    } as Partial<LoadedRules> as LoadedRules
    const results = await searchEverything('take and', { catalogue: null, rules, own: async () => null })
    expect(results.filter((result) => result.group === 'Missions')).toEqual([
      expect.objectContaining({ label: 'Take and Hold', detail: 'Force disposition', href: '/force-dispositions/take-and-hold' }),
    ])
  })
})

it('scopes catalogue search without contaminating the complete cached index', () => {
  const loaded = shelfOf(
    { id: 'first', name: 'First', selectionEntries: [{ id: 'one', name: 'One', type: 'unit' }] },
    { id: 'second', name: 'Second', selectionEntries: [{ id: 'two', name: 'Two', type: 'unit' }] },
  )
  compiledGlobalSearchIndex(loaded, null, new Set(['second']))
  expect(compiledGlobalSearchIndex(loaded, null).factions.map(({ result }) => result.label)).toEqual(['First', 'Second'])
})

it('searches only the requested factions', () => {
  const loaded = shelfOf(
    { id: 'first', name: 'First', selectionEntries: [{ id: 'one', name: 'One', type: 'unit' }] },
    { id: 'second', name: 'Second', selectionEntries: [{ id: 'two', name: 'Two', type: 'unit' }] },
  )
  expect(compiledGlobalSearchIndex(loaded, null, new Set(['second'])).factions.map(({ result }) => result.label)).toEqual(['Second'])
})
