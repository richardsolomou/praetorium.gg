import { describe, expect, it } from 'vitest'
import { buildIndex, type CatalogueFile } from '../core/catalogue'
import { buildUnit } from '../core/roster'
import { wargearOf } from '../core/wargear'
import { descriptionKey } from './datacards'
import {
  exportRosterFile,
  importRosterExchange,
  importRosterFile,
  importRosterCatalogueId,
  matchesImportFaction,
} from '../shared/rosterFiles'
import type { LoadedCatalogue } from './catalogueIndex'
import { calculateRosterPrice } from '../shared/pricing'

const system: CatalogueFile = { gameSystem: { id: 'gs', name: 'Test', costTypes: [{ id: 'pts', name: 'pts' }] } }
const faction: CatalogueFile = {
  catalogue: {
    id: 'necrons',
    name: 'Xenos - Necrons',
    selectionEntries: [
      {
        id: 'tomb-blades',
        name: 'Tomb Blades',
        type: 'unit',
        costs: [{ typeId: 'pts', name: 'pts', value: 70 }],
        selectionEntries: [
          {
            id: 'model',
            name: 'Tomb Blade',
            type: 'model',
            constraints: [
              { id: 'model-min', type: 'min', value: 3, field: 'selections', scope: 'parent' },
              { id: 'model-max', type: 'max', value: 6, field: 'selections', scope: 'parent' },
            ],
            selectionEntryGroups: [
              {
                id: 'weapon',
                name: 'Weapon',
                defaultSelectionEntryId: 'blaster',
                constraints: [
                  { id: 'weapon-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
                  { id: 'weapon-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                ],
                selectionEntries: [
                  { id: 'blaster', name: 'Twin gauss blaster', type: 'upgrade' },
                  { id: 'beamer', name: 'Particle beamer', type: 'upgrade' },
                ],
              },
            ],
          },
        ],
      },
      {
        // ListForge names this model after its unit, and each one carries two carbines.
        id: 'piranhas',
        name: 'Piranhas',
        type: 'unit',
        costs: [{ typeId: 'pts', name: 'pts', value: 65 }],
        selectionEntries: [
          {
            id: 'piranha',
            name: 'Piranhas',
            type: 'model',
            constraints: [
              { id: 'piranha-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
              { id: 'piranha-max', type: 'max', value: 3, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [
              {
                id: 'carbine',
                name: 'Twin pulse carbine',
                type: 'upgrade',
                constraints: [
                  { id: 'carbine-min', type: 'min', value: 2, field: 'selections', scope: 'parent' },
                  { id: 'carbine-max', type: 'max', value: 2, field: 'selections', scope: 'parent' },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'immortals',
        name: 'Immortals',
        type: 'unit',
        // "All models must be equipped identically", as the catalogue writes it.
        modifiers: [
          {
            type: 'add',
            field: 'error',
            value: 'All models must be equipped identically',
            conditionGroups: [
              {
                type: 'and',
                conditions: [
                  { type: 'atLeast', value: 1, field: 'selections', scope: 'immortals', childId: 'gauss', includeChildSelections: true },
                  { type: 'atLeast', value: 1, field: 'selections', scope: 'immortals', childId: 'tesla', includeChildSelections: true },
                ],
              },
            ],
          },
        ],
        selectionEntries: [
          {
            id: 'immortal',
            name: 'Immortal',
            type: 'model',
            constraints: [{ id: 'immortal-min', type: 'min', value: 5, field: 'selections', scope: 'parent' }],
            selectionEntryGroups: [
              {
                id: 'guns',
                name: 'Weapons',
                defaultSelectionEntryId: 'gauss',
                constraints: [{ id: 'guns-max', type: 'max', value: 5, field: 'selections', scope: 'parent' }],
                selectionEntries: [
                  { id: 'gauss', name: 'Gauss blaster', type: 'upgrade' },
                  { id: 'tesla', name: 'Tesla carbine', type: 'upgrade' },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'lord',
        name: 'Lokhust Lord',
        type: 'model',
        selectionEntryGroups: [
          {
            id: 'enhancements',
            name: 'Enhancements',
            constraints: [{ id: 'enhancement-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
            selectionEntries: [
              { id: 'relic', name: 'Demanding Leader', type: 'upgrade' },
              { id: 'assault', name: 'Furious Assault (Upgrade)', type: 'upgrade' },
            ],
          },
        ],
      },
      {
        id: 'intercessor-squad',
        name: 'Intercessor Squad',
        type: 'unit',
        selectionEntryGroups: [
          {
            id: 'intercessors',
            name: 'Intercessors',
            constraints: [
              { id: 'intercessors-min', type: 'min', value: 5, field: 'selections', scope: 'parent' },
              { id: 'intercessors-max', type: 'max', value: 10, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [
              {
                id: 'sergeant',
                name: 'Intercessor Sergeant',
                type: 'model',
                constraints: [
                  { id: 'sergeant-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
                  { id: 'sergeant-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                ],
                selectionEntryGroups: [
                  {
                    id: 'sergeant-weapon',
                    name: 'Weapon',
                    defaultSelectionEntryId: 'sergeant-rifle',
                    constraints: [
                      { id: 'sergeant-weapon-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
                      { id: 'sergeant-weapon-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                    ],
                    selectionEntries: [
                      { id: 'sergeant-rifle', name: 'Bolt rifle', type: 'upgrade' },
                      {
                        id: 'sergeant-launcher-loadout',
                        name: 'Bolt rifle w/ grenade launcher',
                        type: 'upgrade',
                        selectionEntries: [
                          {
                            id: 'loadout-rifle',
                            name: 'Bolt rifle',
                            type: 'upgrade',
                            constraints: [{ id: 'loadout-rifle-min', type: 'min', value: 1, field: 'selections', scope: 'parent' }],
                          },
                          {
                            id: 'grenade-launcher',
                            name: 'Astartes grenade launcher',
                            type: 'upgrade',
                            constraints: [{ id: 'grenade-launcher-min', type: 'min', value: 1, field: 'selections', scope: 'parent' }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                id: 'intercessor',
                name: 'Intercessor',
                type: 'model',
                constraints: [
                  { id: 'intercessor-min', type: 'min', value: 4, field: 'selections', scope: 'parent' },
                  { id: 'intercessor-max', type: 'max', value: 9, field: 'selections', scope: 'parent' },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'assault-squad',
        name: 'Assault Squad',
        type: 'unit',
        selectionEntryGroups: [
          {
            id: 'assault-models',
            name: 'Models',
            constraints: [
              { id: 'assault-min', type: 'min', value: 5, field: 'selections', scope: 'parent' },
              { id: 'assault-max', type: 'max', value: 10, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [
              {
                id: 'assault-marines',
                name: 'Assault Marines',
                type: 'model',
                profiles: [{ id: 'assault-marine-profile', name: 'Assault Marine', typeName: 'Unit' }],
                constraints: [{ id: 'assault-marines-min', type: 'min', value: 5, field: 'selections', scope: 'parent' }],
              },
            ],
          },
        ],
      },
      {
        id: 'recon-squad',
        name: 'Recon Squad',
        type: 'unit',
        selectionEntryGroups: [
          {
            id: 'recon-troopers',
            name: '9 Recon Troopers',
            defaultSelectionEntryId: 'recon-lasgun',
            constraints: [
              { id: 'recon-min', type: 'min', value: 9, field: 'selections', scope: 'parent' },
              { id: 'recon-max', type: 'max', value: 9, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [
              {
                id: 'recon-lasgun',
                name: 'Recon Trooper w/ Lasgun',
                type: 'model',
                constraints: [
                  { id: 'recon-lasgun-min', type: 'min', value: 3, field: 'selections', scope: 'parent' },
                  { id: 'recon-lasgun-max', type: 'max', value: 9, field: 'selections', scope: 'parent' },
                ],
                selectionEntries: [
                  {
                    id: 'lasgun',
                    name: 'Lasgun',
                    type: 'upgrade',
                    constraints: [{ id: 'lasgun-min', type: 'min', value: 1, field: 'selections', scope: 'parent' }],
                  },
                ],
              },
              {
                id: 'recon-vox',
                name: 'Recon Trooper w/ Vox-caster',
                type: 'model',
                constraints: [{ id: 'recon-vox-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
                selectionEntries: [
                  {
                    id: 'vox',
                    name: 'Vox-caster',
                    type: 'upgrade',
                    constraints: [{ id: 'vox-min', type: 'min', value: 1, field: 'selections', scope: 'parent' }],
                  },
                  {
                    id: 'vox-lasgun',
                    name: 'Lasgun',
                    type: 'upgrade',
                    constraints: [{ id: 'vox-lasgun-min', type: 'min', value: 1, field: 'selections', scope: 'parent' }],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'tempestor',
        name: 'Tempestor Prime',
        type: 'model',
        selectionEntries: [
          {
            id: 'scion-warlord',
            name: 'Warlord',
            type: 'upgrade',
            constraints: [{ id: 'scion-warlord-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
            entryLinks: [
              {
                id: 'renamed-warlord',
                name: 'Warlord',
                targetId: 'warlord-ability',
                type: 'selectionEntry',
                modifiers: [{ type: 'set', field: 'name', value: 'Militarum Tempestus Warlord' }],
              },
            ],
          },
        ],
      },
      {
        id: 'battle-tank',
        name: 'Battle Tank',
        type: 'model',
        selectionEntryGroups: [
          {
            id: 'hull',
            name: 'Hull weapon',
            defaultSelectionEntryId: 'hull-bolter',
            constraints: [
              { id: 'hull-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
              { id: 'hull-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [
              { id: 'hull-bolter', name: 'Heavy bolter', type: 'upgrade' },
              { id: 'hull-lascannon', name: 'Lascannon', type: 'upgrade' },
            ],
          },
          {
            id: 'sponsons',
            name: 'Sponsons',
            defaultSelectionEntryId: 'sponson-bolters',
            constraints: [
              { id: 'sponsons-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
              { id: 'sponsons-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [
              {
                id: 'sponson-bolters',
                name: '2 Heavy bolters',
                type: 'upgrade',
                selectionEntries: [
                  {
                    id: 'sponson-bolter',
                    name: 'Heavy bolter',
                    type: 'upgrade',
                    constraints: [
                      { id: 'sponson-bolter-min', type: 'min', value: 2, field: 'selections', scope: 'parent' },
                      { id: 'sponson-bolter-max', type: 'max', value: 2, field: 'selections', scope: 'parent' },
                    ],
                  },
                ],
              },
              { id: 'sponson-flamers', name: '2 Heavy flamers', type: 'upgrade' },
            ],
          },
        ],
      },
    ],
    sharedSelectionEntries: [{ id: 'warlord-ability', name: 'Warlord', type: 'upgrade' }],
  },
}

const allies: CatalogueFile = {
  catalogue: {
    id: 'marines',
    name: 'Imperium - Space Marines',
    selectionEntries: [{ id: 'terminator-squad', name: 'Terminator Squad', type: 'unit' }],
  },
}

const loaded: LoadedCatalogue = {
  index: buildIndex([system, faction, allies], 'test-revision'),
  characteristicNames: new Map(),
  datacards: {
    factions: new Map(),
    detachmentRules: new Map(),
    enhancements: new Map([[descriptionKey('Skyshroud Spearhead', 'Veil of Darkness'), 'Vanishes.']]),
    stratagems: new Map(),
    stratagemsById: new Map(),
    armyRules: new Map(),
    constructionDetachments: new Map(),
    enhancementPoints: new Map(),
  },
  factions: [
    { id: 'necrons', name: 'Xenos - Necrons', references: [] },
    { id: 'marines', name: 'Imperium - Space Marines', references: [] },
  ],
  detachments: new Map([
    [
      'necrons',
      {
        wrapperId: 'detachments',
        groupId: 'detachment-options',
        options: [
          { id: 'pantheon', name: 'Pantheon of Woe', disposition: 'disruption' },
          { id: 'skyshroud', name: 'Skyshroud Spearhead', disposition: 'reconnaissance' },
        ],
      },
    ],
  ]),
  factionContents: new Map(),
}

/** A squad whose heavy weapon names its carrier, as the Terminator Squad's cyclone missile launcher does. */
const terminators: LoadedCatalogue = {
  ...loaded,
  index: buildIndex(
    [
      system,
      {
        catalogue: {
          id: 'terminators',
          name: 'Imperium - Adeptus Astartes - Space Marines',
          selectionEntries: [
            {
              id: 'terminator-squad',
              name: 'Terminator Squad',
              type: 'unit',
              costs: [{ typeId: 'pts', name: 'pts', value: 190 }],
              selectionEntryGroups: [
                {
                  id: 'models',
                  name: 'Terminators',
                  defaultSelectionEntryId: 'fist',
                  constraints: [
                    { id: 'models-min', type: 'min', value: 5, field: 'selections', scope: 'parent' },
                    { id: 'models-max', type: 'max', value: 5, field: 'selections', scope: 'parent' },
                  ],
                  selectionEntries: [
                    {
                      id: 'sergeant',
                      name: 'Terminator Sergeant',
                      type: 'model',
                      constraints: [
                        { id: 'sergeant-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
                        { id: 'sergeant-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                      ],
                      selectionEntries: [
                        {
                          id: 'sergeant-bolter',
                          name: 'Storm bolter',
                          type: 'upgrade',
                          constraints: [{ id: 'sergeant-bolter-min', type: 'min', value: 1, field: 'selections', scope: 'parent' }],
                        },
                        {
                          id: 'sergeant-weapon',
                          name: 'Power weapon',
                          type: 'upgrade',
                          constraints: [{ id: 'sergeant-weapon-min', type: 'min', value: 1, field: 'selections', scope: 'parent' }],
                        },
                      ],
                    },
                    {
                      id: 'fist',
                      name: 'Terminator w/ Power Fist',
                      type: 'model',
                      constraints: [{ id: 'fist-max', type: 'max', value: 4, field: 'selections', scope: 'parent' }],
                      selectionEntries: [
                        {
                          id: 'fist-weapon',
                          name: 'Power fist',
                          type: 'upgrade',
                          constraints: [{ id: 'fist-weapon-min', type: 'min', value: 1, field: 'selections', scope: 'parent' }],
                        },
                        {
                          id: 'fist-bolter',
                          name: 'Storm bolter',
                          type: 'upgrade',
                          constraints: [{ id: 'fist-bolter-min', type: 'min', value: 1, field: 'selections', scope: 'parent' }],
                        },
                      ],
                    },
                    {
                      id: 'heavy',
                      name: 'Terminator w/ Heavy Weapon',
                      type: 'model',
                      constraints: [{ id: 'heavy-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
                      selectionEntries: [
                        {
                          id: 'heavy-fist',
                          name: 'Power fist',
                          type: 'upgrade',
                          constraints: [{ id: 'heavy-fist-min', type: 'min', value: 1, field: 'selections', scope: 'parent' }],
                        },
                      ],
                      selectionEntryGroups: [
                        {
                          id: 'heavy-weapon',
                          name: 'Heavy weapon',
                          constraints: [
                            { id: 'heavy-weapon-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
                            { id: 'heavy-weapon-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                          ],
                          selectionEntries: [
                            { id: 'flamer', name: 'Heavy flamer', type: 'upgrade' },
                            {
                              id: 'cyclone',
                              name: 'Cyclone Missile Launcher & Storm Bolter',
                              type: 'upgrade',
                              costs: [{ typeId: 'pts', name: 'pts', value: 10 }],
                              selectionEntries: [
                                {
                                  id: 'cyclone-launcher',
                                  name: 'Cyclone missile launcher',
                                  type: 'upgrade',
                                  constraints: [
                                    { id: 'cyclone-launcher-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
                                  ],
                                },
                                {
                                  id: 'cyclone-bolter',
                                  name: 'Storm bolter',
                                  type: 'upgrade',
                                  constraints: [{ id: 'cyclone-bolter-min', type: 'min', value: 1, field: 'selections', scope: 'parent' }],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
    'test-revision',
  ),
  factions: [{ id: 'terminators', name: 'Imperium - Adeptus Astartes - Space Marines', references: [] }],
  detachments: new Map(),
}

describe('a specialist the text names only by its weapon', () => {
  const list = (unit: string) => `Cyclone check (200 Points)

Space Marines
Strike Force (2,000 Points)

OTHER DATASHEETS

${unit}

Exported with New Recruit v36.49, Data Version: v2`

  it('arms the model that carries it', () => {
    const imported = importRosterFile(
      {
        file: list(`Terminator Squad (200 Points)
  • 1x Terminator Sergeant
     ◦ 1x Power weapon
     ◦ 1x Storm bolter
  • 4x Terminator
     ◦ 1x Cyclone missile launcher
     ◦ 3x Power fist
     ◦ 1x Power fist
     ◦ 4x Storm bolter`),
      },
      terminators,
    )

    expect(imported.currentPoints).toBe(200)
  })

  it('reports a weapon no model is left to carry', () => {
    const imported = importRosterFile(
      {
        file: list(`Terminator Squad (200 Points)
  • 1x Terminator Sergeant
  • 4x Terminator
     ◦ 1x Heavy flamer
     ◦ 1x Cyclone missile launcher`),
      },
      terminators,
    )

    expect(imported.unplaced).toEqual([
      {
        unit: 'Terminator Squad',
        choices: [{ name: 'Heavy flamer', reason: 'no model in the imported unit carries it' }],
      },
    ])
  })
})

describe('roster export', () => {
  it('retains released base rules on import even after another codex becomes the default', () => {
    const exported = exportRosterFile(
      { catalogueId: 'necrons', detachmentIds: [], disposition: null, limit: 2000, name: 'Released army', units: [] },
      loaded,
      { points: 0, disposition: null, detachments: [], units: [] },
      [],
    )
    expect(importRosterCatalogueId(exported.text)).toBe('necrons')
  })
  it('keeps the selected codex identity in exported text for import after promotion', () => {
    const exported = exportRosterFile(
      { catalogueId: 'codex~necrons', detachmentIds: [], disposition: null, limit: 2000, name: 'Preview army', units: [] },
      {
        ...loaded,
        edition: {
          id: 'codex',
          name: 'Necrons codex',
          status: 'preview',
          default: false,
          catalogueIds: ['necrons'],
          releases: [{ at: 1, status: 'preview' }],
        },
      },
      { points: 0, disposition: null, detachments: [], units: [] },
      [],
    )
    expect(importRosterCatalogueId(exported.text)).toBe('codex~necrons')
    expect(exported.text).toContain('Codex: Necrons codex · Preview')
  })

  it('includes upgrades and both sides of an attachment', () => {
    const exported = exportRosterFile(
      {
        catalogueId: 'necrons',
        detachmentIds: [],
        disposition: null,
        limit: 2000,
        name: 'Attached force',
        units: [{ entryId: 'lord', attachedTo: 1 }, { entryId: 'immortals' }],
      },
      loaded,
      {
        points: 300,
        disposition: null,
        detachments: [],
        units: [
          {
            key: 0,
            size: { models: 1 },
            name: 'Lokhust Lord',
            points: 100,
            group: 'character',
            attachment: { kind: 'leader', targets: ['Immortals'] },
            enhancements: ['Murdermind'],
            upgrades: [],
            wargear: [],
          },
          {
            key: 1,
            size: { models: 5 },
            name: 'Immortals',
            points: 200,
            group: 'other',
            attachment: null,
            enhancements: [],
            upgrades: ['Deepening Madness'],
            wargear: [],
          },
        ],
      },
      ['Purge the Foe', 'Reconnaissance'],
    )

    expect(exported.text).toContain('Force Dispositions: Purge the Foe, Reconnaissance')
    expect(exported.text).toContain('Lokhust Lord (100 Points)\n    • Leading: Immortals\n    • Enhancement: Murdermind')
    expect(exported.text).toContain('Immortals (200 Points)\n    • Leader: Lokhust Lord\n    • Enhancement: Deepening Madness')
  })
})

describe('BattleBase roster import', () => {
  it('identifies the imported text source', () => {
    const imported = importRosterFile(
      {
        file: `Blades (70 Points)

Necrons
Pantheon of Woe (2 Detachment Points)
Strike Force (2,000 Points)

Exported with BattleBase, Data Version: v20260812`,
      },
      loaded,
    )

    expect(imported.source).toBe('battlebase')
  })

  it('resolves each detachment in a combined purchase label', () => {
    const imported = importRosterFile(
      {
        file: `PoWSS 2K (2000 Points)

Necrons
Pantheon of Woe and Skyshroud Spearhead (3 Detachment Points)
Force Dispositions: Disruption, Reconnaissance
Strike Force (2,000 Points)

Exported with BattleBase, Data Version: v20260812`,
      },
      loaded,
    )

    expect(imported.detachmentIds).toEqual(['pantheon', 'skyshroud'])
  })

  it('leaves a choice between exported dispositions to the player', () => {
    const imported = importRosterFile(
      {
        file: `PoWSS 2K (2000 Points)

Necrons
Pantheon of Woe and Skyshroud Spearhead (3 Detachment Points)
Force Dispositions: Disruption, Reconnaissance
Strike Force (2,000 Points)

Exported with BattleBase, Data Version: v20260812`,
      },
      loaded,
    )

    expect('disposition' in imported ? imported.disposition : undefined).toBeNull()
  })

  it('replaces default repeated wargear with the exported choice', () => {
    const imported = importRosterFile(
      {
        file: `Blades (70 Points)

Necrons
Pantheon of Woe (2 Detachment Points)
Strike Force (2,000 Points)

OTHER DATASHEETS

Tomb Blades (70 Points)
    • 3x Particle beamer

Exported with BattleBase, Data Version: v20260812`,
      },
      loaded,
    )

    expect(imported.units[0]?.spreads?.['model/weapon']).toEqual({ blaster: 0, beamer: 3 })
  })

  it('keeps a split the datasheet forbids exactly as the file states it', () => {
    // Somebody else's builder let them mix, and the file is theirs. Reading it back as
    // four of one gun would hand them an army they did not write; violations is where
    // they get told, and one press of either weapon settles it.
    const imported = importRosterFile(
      {
        file: `Mixed (140 Points)

Necrons
Pantheon of Woe (2 Detachment Points)
Strike Force (2,000 Points)

OTHER DATASHEETS

Immortals (140 Points)
    • 3x Gauss blaster
    • 2x Tesla carbine

Exported with BattleBase, Data Version: v20260812`,
      },
      loaded,
    )

    expect(imported.units[0]?.spreads?.['immortal/guns']).toEqual({ gauss: 3, tesla: 2 })
    const built = buildUnit('immortals', loaded.index, imported.units[0]?.models, undefined, {
      spreads: imported.units[0]?.spreads,
    })!
    expect(wargearOf(built.selection, loaded.index).map((piece) => piece.name)).toEqual(['Gauss blaster', 'Tesla carbine'])
  })

  it('matches an enhancement after its export label', () => {
    const imported = importRosterFile(
      {
        file: `Lord (80 Points)

Necrons
Pantheon of Woe (2 Detachment Points)
Strike Force (2,000 Points)

CHARACTERS

Lokhust Lord (80 Points)
    • Enhancement: Demanding Leader

Exported with BattleBase, Data Version: v20260812`,
      },
      loaded,
    )

    expect(imported.units[0]?.choices?.enhancements).toBe('relic')
  })

  it('places equipment nested under a model line', () => {
    const imported = importRosterFile(
      {
        file: `List (100 Points)

Necrons
Pantheon of Woe (2 Detachment Points)
Strike Force (2,000 Points)

OTHER DATASHEETS

Tomb Blades (70 Points)
    • 3x Tomb Blade
        ◦ 3x Particle beamer

Exported with BattleBase, Data Version: v20260812`,
      },
      loaded,
    )

    expect(imported.units[0]?.spreads?.['model/weapon']).toEqual({ blaster: 0, beamer: 3 })
  })

  it('matches an enhancement after a plural export label', () => {
    const imported = importRosterFile(
      {
        file: `List (100 Points)

Necrons
Pantheon of Woe (2 Detachment Points)
Strike Force (2,000 Points)

CHARACTERS

Lokhust Lord (80 Points)
    • Enhancements: Demanding Leader

Exported with BattleBase, Data Version: v20260812`,
      },
      loaded,
    )

    expect(imported.units[0]?.choices?.enhancements).toBe('relic')
  })

  it('sizes a squad from the models its lines state', () => {
    const imported = importRosterFile(
      {
        file: `List (100 Points)

Necrons
Pantheon of Woe (2 Detachment Points)
Strike Force (2,000 Points)

BATTLELINE

Intercessor Squad (160 Points)
    • 1x Intercessor Sergeant
    • 9x Intercessor

Exported with BattleBase, Data Version: v20260812`,
      },
      loaded,
    )

    expect(imported.units[0]?.models).toBe(10)
  })

  it('recognises a model line by its datasheet stat-line name', () => {
    const imported = importRosterFile(
      {
        file: `List (100 Points)

Necrons
Pantheon of Woe (2 Detachment Points)
Strike Force (2,000 Points)

OTHER DATASHEETS

Assault Squad (100 Points)
    • 5x Assault Marine

Exported with BattleBase, Data Version: v20260812`,
      },
      loaded,
    )

    expect(imported.unplaced).toEqual([])
  })

  it('names equipment the datasheet cannot place instead of defaulting silently', () => {
    const imported = importRosterFile(
      {
        file: `Blades (70 Points)

Necrons
Pantheon of Woe (2 Detachment Points)
Strike Force (2,000 Points)

OTHER DATASHEETS

Tomb Blades (70 Points)
    • 3x Photon lance

Exported with BattleBase, Data Version: v20260812`,
      },
      loaded,
    )

    expect(imported.unplaced).toEqual([
      { unit: 'Tomb Blades', choices: [{ name: 'Photon lance', reason: 'nothing in the Necrons catalogue is called that' }] },
    ])
  })

  it('names an enhancement the faction does not offer', () => {
    const imported = importRosterFile(
      {
        file: `Lord (80 Points)

Necrons
Pantheon of Woe (2 Detachment Points)
Strike Force (2,000 Points)

CHARACTERS

Lokhust Lord (80 Points)
    • Enhancement: Withering Presence

Exported with BattleBase, Data Version: v20260812`,
      },
      loaded,
    )

    expect(imported.unplaced).toEqual([
      { unit: 'Lokhust Lord', choices: [{ name: 'Withering Presence', reason: 'nothing in the Necrons catalogue is called that' }] },
    ])
  })

  it('names a Warlord the datasheet cannot be', () => {
    const imported = importRosterFile(
      {
        file: `Lord (80 Points)

Necrons
Pantheon of Woe (2 Detachment Points)
Strike Force (2,000 Points)

CHARACTERS

Lokhust Lord (80 Points)
    • Warlord

Exported with BattleBase, Data Version: v20260812`,
      },
      loaded,
    )

    expect(imported.unplaced).toEqual([
      { unit: 'Lokhust Lord', choices: [{ name: 'Warlord', reason: 'this datasheet has no Warlord option' }] },
    ])
  })

  it('names an attachment whose target is not in the list', () => {
    const imported = importRosterFile(
      {
        file: `Lord (80 Points)

Necrons
Pantheon of Woe (2 Detachment Points)
Strike Force (2,000 Points)

CHARACTERS

Lokhust Lord (80 Points)
    • Leading: Immortals

Exported with BattleBase, Data Version: v20260812`,
      },
      loaded,
    )

    expect(imported.unplaced).toEqual([
      { unit: 'Lokhust Lord', choices: [{ name: 'Leading Immortals', reason: 'this list has no Immortals' }] },
    ])
  })

  it('says nothing about equipment it placed', () => {
    const imported = importRosterFile(
      {
        file: `Blades (70 Points)

Necrons
Pantheon of Woe (2 Detachment Points)
Strike Force (2,000 Points)

OTHER DATASHEETS

Tomb Blades (70 Points)
    • 3x Particle beamer

Exported with BattleBase, Data Version: v20260812`,
      },
      loaded,
    )

    expect(imported.unplaced).toEqual([])
  })

  it('names the detachment an enhancement belongs to', () => {
    const imported = importRosterFile(
      {
        file: `Lord (80 Points)

Necrons
Pantheon of Woe (2 Detachment Points)
Strike Force (2,000 Points)

CHARACTERS

Lokhust Lord (80 Points)
    • Enhancement: Veil of Darkness

Exported with BattleBase, Data Version: v20260812`,
      },
      loaded,
    )

    expect(imported.unplaced).toEqual([
      { unit: 'Lokhust Lord', choices: [{ name: 'Veil of Darkness', reason: 'an enhancement of the Skyshroud Spearhead detachment' }] },
    ])
  })

  it('separates an enhancement of the chosen detachment from one of another', () => {
    const imported = importRosterFile(
      {
        file: `Blades (70 Points)

Necrons
Skyshroud Spearhead (2 Detachment Points)
Strike Force (2,000 Points)

OTHER DATASHEETS

Tomb Blades (70 Points)
    • Enhancement: Veil of Darkness

Exported with BattleBase, Data Version: v20260812`,
      },
      loaded,
    )

    expect(imported.unplaced).toEqual([
      { unit: 'Tomb Blades', choices: [{ name: 'Veil of Darkness', reason: 'this datasheet cannot take that enhancement' }] },
    ])
  })

  it('separates wargear the faction has from wargear it does not', () => {
    const imported = importRosterFile(
      {
        file: `Blades (70 Points)

Necrons
Pantheon of Woe (2 Detachment Points)
Strike Force (2,000 Points)

OTHER DATASHEETS

Tomb Blades (70 Points)
    • 3x Tesla carbine

Exported with BattleBase, Data Version: v20260812`,
      },
      loaded,
    )

    expect(imported.unplaced).toEqual([
      { unit: 'Tomb Blades', choices: [{ name: 'Tesla carbine', reason: 'this datasheet does not offer it' }] },
    ])
  })

  it('names the faction a datasheet belongs to instead', () => {
    const imported = importRosterFile(
      {
        file: `Allies (100 Points)

Necrons
Pantheon of Woe (2 Detachment Points)
Strike Force (2,000 Points)

OTHER DATASHEETS

Terminator Squad (100 Points)

Exported with BattleBase, Data Version: v20260812`,
      },
      loaded,
    )

    expect(imported.unknown).toEqual([{ name: 'Terminator Squad', reason: 'a Space Marines datasheet, not Necrons' }])
  })

  it('names the closest datasheet to one it cannot find', () => {
    const imported = importRosterFile(
      {
        file: `Blades (70 Points)

Necrons
Pantheon of Woe (2 Detachment Points)
Strike Force (2,000 Points)

OTHER DATASHEETS

Tomb Blade Squad (70 Points)

Exported with BattleBase, Data Version: v20260812`,
      },
      loaded,
    )

    expect(imported.unknown).toEqual([
      { name: 'Tomb Blade Squad', reason: 'no Necrons datasheet is called that; the closest is "Tomb Blades"' },
    ])
  })

  it('names the closest faction to one it cannot find', () => {
    const imported = importRosterFile(
      {
        file: `Blades (70 Points)

Necron
Pantheon of Woe (2 Detachment Points)
Strike Force (2,000 Points)

OTHER DATASHEETS

Tomb Blades (70 Points)

Exported with BattleBase, Data Version: v20260812`,
      },
      loaded,
    )

    expect(imported.unknown).toEqual([{ name: 'Necron', reason: 'no faction is called that; the closest is "Necrons"' }])
  })

  it('names the closest detachment to one it cannot find', () => {
    const imported = importRosterFile(
      {
        file: `Blades (70 Points)

Necrons
Pantheon of Doom (2 Detachment Points)
Strike Force (2,000 Points)

OTHER DATASHEETS

Tomb Blades (70 Points)

Exported with BattleBase, Data Version: v20260812`,
      },
      loaded,
    )

    expect(imported.unknown).toEqual([
      { name: 'Pantheon of Doom', reason: 'no Necrons detachment is called that; the closest is "Pantheon of Woe"' },
    ])
  })

  it('separates an attachment target this list holds from one it does not', () => {
    const imported = importRosterFile(
      {
        file: `Crowded (300 Points)

Necrons
Pantheon of Woe (2 Detachment Points)
Strike Force (2,000 Points)

CHARACTERS

Lokhust Lord (100 Points)
    • Leading: Immortals

Lokhust Lord (100 Points)
    • Leading: Immortals

OTHER DATASHEETS

Immortals (100 Points)
    • Leader: Lokhust Lord

Exported with BattleBase, Data Version: v20260812`,
      },
      loaded,
    )

    expect(imported.unplaced).toEqual([
      { unit: 'Lokhust Lord (entry 2)', choices: [{ name: 'Leading Immortals', reason: 'every Immortals in this list is already led' }] },
    ])
  })

  it('pairs repeated attachments by occurrence', () => {
    const imported = importRosterFile(
      {
        file: `Repeated leaders (600 Points)

Necrons
Pantheon of Woe (2 Detachment Points)
Strike Force (2,000 Points)

CHARACTERS

Lokhust Lord (100 Points)
    • Leading: Immortals

Lokhust Lord (100 Points)
    • Leading: Immortals

Lokhust Lord (100 Points)
    • Leading: Immortals

OTHER DATASHEETS

Immortals (100 Points)
    • Leader: Lokhust Lord

Immortals (100 Points)
    • Leader: Lokhust Lord

Immortals (100 Points)
    • Leader: Lokhust Lord

Exported with BattleBase, Data Version: v20260826`,
      },
      loaded,
    )

    expect(imported.units.map((unit) => unit.attachedTo)).toEqual([3, 4, 5, undefined, undefined, undefined])
  })
})

describe('New Recruit text import', () => {
  const list = (units: string) => `List (500 Points)

Necrons
Pantheon of Woe (2 Detachment Points)
Strike Force (2,000 Points)

${units}

Exported with New Recruit v36.49, Data Version: v2`

  it('reads the force disposition it writes on its own line', () => {
    const imported = importRosterFile(
      { file: list('CHARACTERS\n\nLokhust Lord (80 Points)').replace('Detachment Points)\n', 'Detachment Points)\nPurge the Foe\n') },
      loaded,
    )

    expect(imported).toMatchObject({ disposition: 'purge-the-foe', detachmentIds: ['pantheon'] })
  })

  it('attaches a leader listed with its bodyguard', () => {
    const imported = importRosterFile(
      {
        file: list(`ATTACHED UNITS

Attached unit 1

Lokhust Lord (80 Points)
• Attached as: Leader (Character)

Immortals (70 Points)
• Attached as: Bodyguard (Battleline)
• 5x Immortal`),
      },
      loaded,
    )

    expect(imported.units.map((unit) => unit.attachedTo)).toEqual([1, undefined])
  })

  it('matches an enhancement it marks as an upgrade', () => {
    const imported = importRosterFile(
      { file: list('CHARACTERS\n\nLokhust Lord (80 Points)\n• Enhancements: Demanding Leader (Upgrade)') },
      loaded,
    )

    expect(imported.units[0]?.choices?.enhancements).toBe('relic')
  })

  it('matches an enhancement the catalogue itself names as an upgrade', () => {
    const imported = importRosterFile(
      { file: list('CHARACTERS\n\nLokhust Lord (80 Points)\n• Enhancements: Furious Assault (Upgrade)') },
      loaded,
    )

    expect(imported.units[0]?.choices?.enhancements).toBe('assault')
  })

  it('reads a model named without its loadout', () => {
    const imported = importRosterFile(
      { file: list('OTHER DATASHEETS\n\nRecon Squad (80 Points)\n• 9x Recon Trooper\n◦ 9x Lasgun') },
      loaded,
    )

    expect(imported.unplaced).toEqual([])
  })

  it('swaps a default trooper for the specialist a list names', () => {
    const imported = importRosterFile(
      { file: list('OTHER DATASHEETS\n\nRecon Squad (80 Points)\n• 9x Recon Trooper\n◦ 9x Lasgun\n◦ 1x Vox-caster') },
      loaded,
    )
    const unit = imported.units[0]!
    const built = buildUnit(unit.entryId, loaded.index, unit.models, unit.choices, {
      primaryCatalogueId: 'necrons',
      spreads: unit.spreads,
    })!

    expect(wargearOf(built.selection, loaded.index)).toEqual([
      { name: 'Lasgun', count: 9 },
      { name: 'Vox-caster', count: 1 },
    ])
  })

  it('keeps the default troopers when a list names no specialist', () => {
    const imported = importRosterFile(
      { file: list('OTHER DATASHEETS\n\nRecon Squad (80 Points)\n• 9x Recon Trooper\n◦ 9x Lasgun') },
      loaded,
    )
    const unit = imported.units[0]!
    const built = buildUnit(unit.entryId, loaded.index, unit.models, unit.choices, {
      primaryCatalogueId: 'necrons',
      spreads: unit.spreads,
    })!

    expect(wargearOf(built.selection, loaded.index)).toEqual([{ name: 'Lasgun', count: 9 }])
  })

  it('crowns a unit whose Warlord entry the catalogue renames', () => {
    const imported = importRosterFile(
      { file: list('CHARACTERS\n\nTempestor Prime (100 Points)\n• 1x Militarum Tempestus Warlord') },
      loaded,
    )

    expect(imported.units[0]?.toggles).toEqual({ 'scion-warlord': 1 })
  })

  it('reads a hull weapon apart from the sponsons that share a name with the other option', () => {
    const imported = importRosterFile(
      { file: list('OTHER DATASHEETS\n\nBattle Tank (150 Points)\n• 2x Heavy bolter\n• 1x Lascannon') },
      loaded,
    )

    expect(imported.units[0]?.choices?.hull).toBe('hull-lascannon')
  })
})

describe('Praetorium roster import', () => {
  const setup = 'Repeated (999 Points)\n\nNecrons\nNo detachment\nStrike Force (2,000 Points)\n\nOTHER DATASHEETS\n\n'
  const footer = '\nExported with Praetorium.gg vtest\nRuleset: necrons\n'

  it('reports each repeated partially matched entry separately', () => {
    const text = setup + 'Tomb Blades (70 Points)\n • 3x Photon lance\n\nTomb Blades (70 Points)\n • 3x Photon lance\n' + footer
    expect(importRosterFile({ file: text }, loaded).unplaced.map((row) => row.unit)).toEqual([
      'Tomb Blades (entry 1)',
      'Tomb Blades (entry 2)',
    ])
  })

  it('separates stated points from the authoritative price of the matched entries', () => {
    const text = setup + 'Tomb Blades (70 Points)\n • 3x Particle beamer\n' + footer
    expect(importRosterFile({ file: text }, loaded)).toMatchObject({ reportedPoints: 999, currentPoints: 70, sourceUnitCount: 1 })
  })

  it('does not fall back to a same-named unit when a stated attachment identity is missing', () => {
    const text =
      setup +
      'Lokhust Lord (70 Points)\n • Leading: Immortals\n • Attached to entry: 99\n\nImmortals (100 Points)\n • Roster entry: 2\n' +
      footer
    expect(importRosterFile({ file: text }, loaded).unplaced).toEqual([
      {
        unit: 'Lokhust Lord',
        choices: [{ name: 'Attached to entry 99', reason: 'the attachment does not identify exactly one other matched entry' }],
      },
    ])
  })

  it('preserves explicit model counts when there is no equipment to infer them from', () => {
    const text = setup + 'Tomb Blades (70 Points)\n • Models: 6\n' + footer
    expect(importRosterFile({ file: text }, loaded).units[0]?.models).toBe(6)
  })

  it('does not replace a missing explicit target through a different same-named leader', () => {
    const text =
      setup +
      'Lokhust Lord (70 Points)\n\nLokhust Lord (70 Points)\n • Leading: Immortals\n • Attached to entry: 99\n\nImmortals (100 Points)\n • Leader: Lokhust Lord\n • Roster entry: 3\n' +
      footer
    expect(importRosterFile({ file: text }, loaded).units[1]?.attachedTo).toBeUndefined()
  })

  it.each([0, 1, 3])('accounts for all %i source entries including unmatched units', (count) => {
    const text = setup + Array.from({ length: count }, (_, at) => `Unknown ${at} (70 Points)\n`).join('\n') + footer
    const imported = importRosterFile({ file: text }, loaded)
    expect({ total: imported.sourceUnitCount, matched: imported.units.length, missing: imported.unknown.length }).toEqual({
      total: count,
      matched: 0,
      missing: count,
    })
  })

  it('refuses oversized entry sets before building or saving them', () => {
    const text = setup + 'Tomb Blades (70 Points)\n'.repeat(101) + footer
    expect(() => importRosterFile({ file: text }, loaded)).toThrow('at most 100 entries')
  })

  it('refuses oversized text before attempting format recognition', () => {
    expect(() => importRosterFile({ file: 'x'.repeat(200_001) }, loaded)).toThrow('200000')
  })

  it('does not guess a supported battle size for an explicitly unsupported size', () => {
    const text = (setup + footer).replace('Strike Force (2,000 Points)', 'Battle (2,500 Points)')
    expect(importRosterFile({ file: text }, loaded)).toMatchObject({ limit: null, unknown: [{ name: '2500 point battle size' }] })
  })

  it('reads a named battle size at its own points as no custom budget', () => {
    expect(importRosterFile({ file: setup + footer }, loaded)).toMatchObject({ limit: 2000, pointsBudget: null })
  })

  it('reads a named battle size beside other points as that size with a custom points budget', () => {
    const text = (setup + footer).replace('Strike Force (2,000 Points)', 'Strike Force (1,500 Points)')
    expect(importRosterFile({ file: text }, loaded)).toMatchObject({ limit: 2000, pointsBudget: 1500, unknown: [] })
  })

  it('reports a custom points budget below the minimum and keeps the named size', () => {
    const text = (setup + footer).replace('Strike Force (2,000 Points)', 'Strike Force (400 Points)')
    expect(importRosterFile({ file: text }, loaded)).toMatchObject({
      limit: 2000,
      pointsBudget: null,
      unknown: [
        { name: 'Strike Force at 400 points', reason: 'Choose between 500 and 10,000 points. It is imported at the standard 2000 points.' },
      ],
    })
  })

  it.each(['text', 'compactText'] as const)('round-trips a custom points budget through the %s export', (layout) => {
    const exported = exportRosterFile(
      { catalogueId: 'necrons', detachmentIds: [], disposition: null, limit: 2000, pointsBudget: 1500, name: 'Budget force', units: [] },
      loaded,
      { points: 0, disposition: null, detachments: [], units: [] },
      [],
    )
    expect(importRosterFile({ file: exported[layout] }, loaded)).toMatchObject({ limit: 2000, pointsBudget: 1500 })
  })

  it('reports an explicit zero model count instead of silently using the minimum squad size', () => {
    const text = setup + 'Tomb Blades (70 Points)\n • Models: 0\n' + footer
    expect(importRosterFile({ file: text }, loaded).unplaced).toEqual([
      { unit: 'Tomb Blades', choices: [{ name: '0 models', reason: 'this datasheet fields 3 to 6 models' }] },
    ])
  })

  it('round-trips exported attachments', () => {
    const exported = exportRosterFile(
      {
        catalogueId: 'necrons',
        detachmentIds: [],
        disposition: null,
        limit: 2000,
        name: 'Shared force',
        units: [{ entryId: 'lord', choices: { enhancements: 'relic' }, attachedTo: 1 }, { entryId: 'immortals' }],
      },
      loaded,
      {
        points: 300,
        disposition: null,
        detachments: [],
        units: [
          {
            key: 0,
            size: { models: 1 },
            name: 'Lokhust Lord',
            points: 100,
            group: 'character',
            attachment: { kind: 'leader', targets: ['Immortals'] },
            enhancements: ['Demanding Leader'],
            upgrades: [],
            wargear: [],
          },
          {
            key: 1,
            size: { models: 5 },
            name: 'Immortals',
            points: 200,
            group: 'other',
            attachment: null,
            enhancements: [],
            upgrades: [],
            wargear: [],
          },
        ],
      },
      [],
    )

    expect(importRosterFile({ file: exported.text }, loaded)).toMatchObject({
      source: 'praetorium',
      name: 'Shared force',
      catalogueId: 'necrons',
      units: [{ entryId: 'lord', choices: { enhancements: 'relic' }, attachedTo: 1 }, { entryId: 'immortals' }],
      unknown: [],
    })
  })
})

describe('NewRecruit roster import', () => {
  it('matches a compound loadout by its uniquely exported weapon', () => {
    const imported = importRosterFile(
      {
        file: `+++++++++++++++++++++++++++++++++++++++++++++++
+ FACTION KEYWORD: Xenos - Necrons
+ TOTAL ARMY POINTS: 80pts
++++++++++++++++++++++++++++++++++++++++++++++

5x Intercessor Squad (80 pts)
• 1x Intercessor Sergeant: Bolt rifle
• 4x Intercessor: 4 with Bolt rifle
  1 with Astartes grenade launcher

Created with newrecruit.eu v35.51`,
      },
      loaded,
    )
    const unit = imported.units[0]!
    const rebuilt = buildUnit(unit.entryId, loaded.index, unit.models, unit.choices, {
      primaryCatalogueId: imported.catalogueId ?? undefined,
      spreads: unit.spreads,
      toggles: unit.toggles,
    })!

    expect(wargearOf(rebuilt.selection, loaded.index)).toContainEqual({ name: 'Astartes grenade launcher', count: 1 })
  })

  it('reports nothing for the model names an export lists beside its weapons', () => {
    const imported = importRosterFile(
      {
        file: `+++++++++++++++++++++++++++++++++++++++++++++++
+ FACTION KEYWORD: Xenos - Necrons
+ TOTAL ARMY POINTS: 80pts
++++++++++++++++++++++++++++++++++++++++++++++

5x Intercessor Squad (80 pts)
• 1x Intercessor Sergeant: Bolt rifle
• 4x Intercessor: 4 with Bolt rifle
  1 with Astartes grenade launcher

Created with newrecruit.eu v35.51`,
      },
      loaded,
    )

    expect(imported.unplaced).toEqual([])
  })

  it('names a squad size the datasheet does not field', () => {
    const imported = importRosterFile(
      {
        file: `+++++++++++++++++++++++++++++++++++++++++++++++
+ FACTION KEYWORD: Xenos - Necrons
+ TOTAL ARMY POINTS: 70pts
++++++++++++++++++++++++++++++++++++++++++++++

8x Tomb Blades (70 pts)
• 8x Tomb Blade: 8 with Particle beamer

Created with newrecruit.eu v35.51`,
      },
      loaded,
    )

    expect(imported.unplaced).toEqual([
      { unit: 'Tomb Blades', choices: [{ name: '8 models', reason: 'this datasheet fields 3 to 6 models' }] },
    ])
  })

  it('resolves setup and grouped model choices', () => {
    const imported = importRosterFile(
      {
        file: `+++++++++++++++++++++++++++++++++++++++++++++++
+ FACTION KEYWORD: Xenos - Necrons
+ DETACHMENT: Pantheon\u00a0of\u00a0Woe, Skyshroud\u00a0Spearhead (Test Rule)
+ FORCE DISPOSITION: Purge the Foe
+ TOTAL ARMY POINTS: 70pts
++++++++++++++++++++++++++++++++++++++++++++++

3x Tomb Blades (70 pts)
• 1x Tomb Blade: Twin gauss blaster
• 2x Tomb Blade: 2 with Particle beamer

Created with newrecruit.eu v35.51`,
      },
      loaded,
    )

    expect(imported).toMatchObject({
      source: 'newrecruit',
      name: 'Necrons 70pts',
      catalogueId: 'necrons',
      detachmentIds: ['pantheon', 'skyshroud'],
      disposition: 'purge-the-foe',
      limit: 600,
      units: [{ models: 3, spreads: { 'model/weapon': { blaster: 1, beamer: 2 } } }],
      unknown: [],
    })
  })
})

describe('unit notes and retired nicknames in text', () => {
  const immortals = (key: number) => ({
    key,
    size: { models: 5 },
    name: 'Immortals',
    points: 200,
    group: 'other' as const,
    attachment: null,
    enhancements: [],
    upgrades: [],
    wargear: [],
  })
  const exported = exportRosterFile(
    {
      catalogueId: 'necrons',
      detachmentIds: [],
      disposition: null,
      limit: 2000,
      name: 'Noted squads',
      units: [{ entryId: 'immortals', note: 'Private plan' }, { entryId: 'immortals' }],
    },
    loaded,
    { points: 400, disposition: null, detachments: [], units: [immortals(0), immortals(1)] },
    [],
  )
  const nicknameLine = { text: '    • Nickname: Alpha', compactText: 'Nickname: Alpha' } as const
  const withNickname = (layout: 'text' | 'compactText') =>
    exported[layout].replace(/^(.*Immortals \(200 (?:Points|pts)\).*)$/m, `$1\n${nicknameLine[layout]}`)

  it.each(['text', 'compactText'] as const)('leaves unit notes out of %s', (layout) => {
    expect(exported[layout]).not.toContain('Private plan')
  })

  it.each(['text', 'compactText'] as const)('still matches every unit in %s exported with a nickname line', (layout) => {
    expect(importRosterFile({ file: withNickname(layout) }, loaded).units.map((unit) => unit.entryId)).toEqual(['immortals', 'immortals'])
  })

  it.each(['text', 'compactText'] as const)('reports a nickname line in %s as a line the importer does not understand', (layout) => {
    expect(importRosterFile({ file: withNickname(layout) }, loaded).unplaced).toEqual([
      {
        unit: 'Immortals (entry 1)',
        choices: [{ name: nicknameLine[layout].trim(), reason: 'this line is not understood by the text importer' }],
      },
    ])
  })
})

describe('roster exchange import', () => {
  const exchange = {
    name: 'Exchanged army',
    catalogueId: 'necrons',
    detachmentIds: ['pantheon'],
    disposition: 'disruption',
    borrowedDetachmentId: null,
    limit: 2000,
    points: 135,
    waivedRules: [],
    optionalRules: [],
    picks: [
      { entryId: 'lord', attachedTo: 1 },
      { entryId: 'immortals', models: 5 },
      { entryId: 'tomb-blades', models: 3 },
    ],
  }

  it('keeps every resolved entry and its attachment', () => {
    expect(importRosterExchange(exchange, loaded, null, 'Xenos - Necrons')).toMatchObject({
      units: exchange.picks,
      unknown: [],
      unplaced: [],
      sourceUnitCount: 3,
      reportedPoints: 135,
    })
  })

  it('carries a custom points budget beside the battle size', () => {
    expect(importRosterExchange({ ...exchange, pointsBudget: 1500 }, loaded, null, 'Xenos - Necrons')).toMatchObject({
      limit: exchange.limit,
      pointsBudget: 1500,
    })
  })

  it('prices the imported entries under the selected rules', () => {
    expect(importRosterExchange(exchange, loaded, null, 'Xenos - Necrons').currentPoints).toBe(
      calculateRosterPrice({ ...exchange, units: exchange.picks }, loaded, null)?.points,
    )
  })

  it('names an entry the rules version cannot resolve and leaves it out', () => {
    const imported = importRosterExchange(
      { ...exchange, picks: [{ entryId: 'retired-unit' }, ...exchange.picks] },
      loaded,
      null,
      'Xenos - Necrons',
    )
    expect([imported.unknown, imported.units.length]).toEqual([
      [{ name: 'Entry 1', reason: 'this datasheet is not in the selected rules version' }],
      3,
    ])
  })

  it('moves attachments with the entries that remain', () => {
    const imported = importRosterExchange(
      { ...exchange, picks: [{ entryId: 'retired-unit' }, { entryId: 'lord', attachedTo: 2 }, { entryId: 'immortals' }] },
      loaded,
      null,
      'Xenos - Necrons',
    )
    expect(imported.units[0]).toEqual({ entryId: 'lord', attachedTo: 1 })
  })

  it('reports an attachment to an entry that is left out', () => {
    const imported = importRosterExchange(
      { ...exchange, picks: [{ entryId: 'lord', attachedTo: 1 }, { entryId: 'retired-unit' }] },
      loaded,
      null,
      'Xenos - Necrons',
    )
    expect([imported.units, imported.unplaced]).toEqual([
      [{ entryId: 'lord' }],
      [{ unit: 'Lokhust Lord (entry 1)', choices: [{ name: 'Attached to entry 2', reason: 'that entry is not imported' }] }],
    ])
  })

  it('names a detachment the rules version no longer offers and leaves it out', () => {
    const imported = importRosterExchange({ ...exchange, detachmentIds: ['pantheon', 'retired'] }, loaded, null, 'Xenos - Necrons')
    expect([imported.detachmentIds, imported.unknown]).toEqual([
      ['pantheon'],
      [{ name: 'Detachment retired', reason: 'this rules version no longer offers it' }],
    ])
  })
})

describe('ListForge, Warmind, and WTC roster import', () => {
  it.each([
    [
      'listforge',
      `Lord - Necrons - Disruption - Pantheon of Woe (150 Points)

Attached Units:
Lokhust Lord + Immortals (150 pts)
  Lokhust Lord (80 pts)
    • Warlord
    • E: Demanding Leader
  Immortals (70 pts)
    • 5x Immortal
      • 5x Tesla carbine
`,
    ],
    [
      'listforge-wtc',
      `+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
List Name: Lord
Factions Used: Necrons
Army Points: 150
Disposition: Disruption
Detachment(s): Pantheon of Woe
+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

ATTACHED UNITS:
Lokhust Lord + Immortals (150 pts)
  Lokhust Lord (80 pts)
    • Warlord
    • Enhancement: Demanding Leader
  Immortals (70 pts)
    • 5x Immortal
      • 5x Tesla carbine
`,
    ],
    [
      'warmind',
      `Lord
──────────────────────────────
Faction: Necrons
Detachment: Pantheon of Woe
Battle Size: Strike Force (2000 pts)
Total: 150 / 2000 pts · 2/3 DP · ✓ Legal
Disposition: Disruption

BATTLELINE
Lokhust Lord (80 pts) · Warlord
   · Enhancement: Demanding Leader (+10 pts)
   └ Leads: Immortals ×5 (70 pts)
      · 5× Tesla carbine

──────────────────────────────
150 / 2000 pts · 2 units · Strike Force
Built with Warmind · https://warmind.online`,
    ],
    [
      'wtc',
      `+++++++++++++++++++++++++++++++++++++++++++++++
+ FACTION KEYWORD: Xenos - Necrons
+ DETACHMENT: Pantheon of Woe
+ FORCE DISPOSITION: Disruption
+ TOTAL ARMY POINTS: 150pts
+ WARLORD: Char1: Lokhust Lord
+++++++++++++++++++++++++++++++++++++++++++++++

Attached Unit 1

Lokhust Lord (80 pts)
• Attached as: Leader (Character)
• Warlord
• Demanding Leader (+10 pts)

Immortals (70 pts)
• Attached as: Bodyguard
• 5x Immortal
• 5x Tesla carbine`,
    ],
  ])('imports %s text with its attachment, enhancement, and reported points', (format, file) => {
    const imported = importRosterFile({ file }, loaded)

    expect(imported).toMatchObject({
      catalogueId: 'necrons',
      detachmentIds: ['pantheon'],
      disposition: 'disruption',
      format,
      source: 'roster-file',
      reportedPoints: 150,
      unknown: [],
      sourceUnitCount: 2,
    })
    expect(imported.units.map((unit) => unit.entryId)).toEqual(['lord', 'immortals'])
    expect(imported.units[0]?.attachedTo).toBe(1)
  })

  it('reads the official layout under a New Recruit WTC header as New Recruit', () => {
    const imported = importRosterFile(
      {
        file: `+++++++++++++++++++++++++++++++++++++++++++++++
+ FACTION KEYWORD: Xenos - Necrons
+ TOTAL ARMY POINTS: 70pts
+++++++++++++++++++++++++++++++++++++++++++++++

OTHER DATASHEETS

Immortals (70 pts)
• 5x Immortal
• 5x Tesla carbine

Created with newrecruit.eu v35.79`,
      },
      loaded,
    )

    expect(imported).toMatchObject({ format: 'newrecruit', source: 'newrecruit', sourceUnitCount: 1 })
  })
})

describe('ListForge, Warmind, and WTC roster export', () => {
  const data = {
    catalogueId: 'necrons',
    detachmentIds: ['pantheon', 'skyshroud'],
    disposition: 'disruption',
    limit: 2000,
    pointsBudget: 1500,
    name: 'Round trip',
    units: [
      { entryId: 'lord', choices: { enhancements: 'relic' }, attachedTo: 1 },
      { entryId: 'immortals', models: 6 },
      { entryId: 'tempestor', toggles: { 'scion-warlord': 1 } },
      { entryId: 'tomb-blades', models: 4 },
    ],
  }
  const priced = calculateRosterPrice(data, loaded, null)!
  const exported = exportRosterFile(data, loaded, { ...priced, disposition: priced.disposition ?? null }, ['Disruption'])
  const { source: _source, format: _format, ...readable } = importRosterFile({ file: exported.text }, loaded)
  const withModels = (models: number) => readable.units.map((unit) => (unit.entryId === 'immortals' ? { ...unit, models } : unit))

  it.each([
    // ListForge states no battle size, and Immortals state no wargear to infer six models from.
    ['listForgeText', 'listforge', { limit: null, pointsBudget: null, units: withModels(5) }],
    ['warmindText', 'warmind', {}],
    ['wtcText', 'wtc', { units: withModels(5) }],
  ] as const)('reads %s back with only its documented losses', (layout, format, dropped) => {
    expect(importRosterFile({ file: exported[layout] }, loaded)).toEqual({ ...readable, ...dropped, source: 'roster-file', format })
  })

  it('separates detachments with commas, as ListForge and Warmind write them', () => {
    expect(
      [exported.listForgeText, exported.warmindText, exported.wtcText].map((text) => text.includes('Pantheon of Woe, Skyshroud Spearhead')),
    ).toEqual([true, true, true])
  })

  it('marks enhancements in ListForge text as ListForge does', () => {
    expect(exported.listForgeText).toContain('    • E: Demanding Leader\n')
  })

  it('compares against a readable import that keeps every field', () => {
    expect(readable).toMatchObject({
      detachmentIds: ['pantheon', 'skyshroud'],
      disposition: 'disruption',
      limit: 2000,
      pointsBudget: 1500,
      unknown: [],
      unplaced: [],
      units: [
        { entryId: 'lord', models: 1, choices: { enhancements: 'relic' }, attachedTo: 1 },
        { entryId: 'immortals', models: 6 },
        { entryId: 'tempestor', toggles: { 'scion-warlord': 1 } },
        { entryId: 'tomb-blades', models: 4, spreads: { 'model/weapon': { blaster: 4, beamer: 0 } } },
      ],
    })
  })

  it('keeps the rules version only in Warmind text', () => {
    const preview = exportRosterFile(
      { ...data, catalogueId: 'codex~necrons' },
      {
        ...loaded,
        edition: { id: 'codex', name: 'Necrons codex', status: 'preview', default: false, catalogueIds: ['necrons'], releases: [] },
      },
      { ...priced, disposition: priced.disposition ?? null },
      ['Disruption'],
    )
    expect(importRosterCatalogueId(preview.warmindText)).toBe('codex~necrons')
    expect(importRosterCatalogueId(preview.listForgeText)).toBeNull()
    expect(importRosterCatalogueId(preview.wtcText)).toBeNull()
  })
})

describe('text import sizing', () => {
  it('counts the models a text names before the wargear they carry', () => {
    const file =
      'Scouts - Necrons - Pantheon of Woe (65 Points)\n\nVehicle:\nPiranhas (65 pts)\n  • Piranhas\n    • 2x Twin pulse carbine\n'
    expect(importRosterFile({ file }, loaded).units[0]?.models).toBe(1)
  })
})

describe('import faction names', () => {
  it.each([
    ['Adeptus Astartes', 'Imperium - Space Marines'],
    ['Legiones Daemonica', 'Chaos - Chaos Daemons'],
    ['Heretic Astartes', 'Chaos - Chaos Space Marines'],
  ])('reads the faction keyword %s as %s', (keyword, catalogue) => {
    expect(matchesImportFaction(keyword, catalogue)).toBe(true)
  })
})
