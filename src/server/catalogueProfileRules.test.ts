import { expect, it } from 'vitest'
import { buildIndex, type CatalogueFile } from '../core/catalogue'
import { detachmentsOf, factionsIn, isReferenceDatasheet, type LoadedCatalogue } from './catalogueIndex'
import {
  catalogueProfileMetadata,
  isProfiledDetachment,
  prepareCatalogueProfileRules,
  profiledArmyRulesFor,
  profiledDetachmentCards,
  profiledDetachmentPoints,
} from './catalogueProfileRules'
import { factionsFor } from './factionReferences'
import { battleDetachmentData, selectedBattleDetachmentData } from './battleDetachmentData'
import { detachmentReference } from './detachmentReference'
import { calculateRosterPrice } from './pricing'
import type { LoadedRules } from './rules'

const files: CatalogueFile[] = [
  {
    gameSystem: {
      id: 'system',
      name: 'Game',
      costTypes: [
        { id: 'points', name: 'pts' },
        { id: 'dp', name: 'Detachment Points' },
      ],
    },
  },
  {
    catalogue: {
      id: 'space-marines',
      name: 'Imperium - Adeptus Astartes - Space Marines',
      sharedSelectionEntries: [
        {
          id: 'intercessors',
          name: 'Intercessors',
          type: 'unit',
          infoLinks: [{ id: 'doctrine-link', name: 'Combat Doctrines', targetId: 'doctrine', type: 'profile' }],
        },
      ],
      sharedProfiles: [
        {
          id: 'doctrine',
          name: 'Combat Doctrines',
          typeName: 'Abilities',
          characteristics: [{ name: 'Description', $text: 'Select a doctrine.' }],
        },
      ],
      sharedSelectionEntryGroups: [
        {
          id: 'space-marines-detachments',
          name: 'Detachment',
          selectionEntries: [
            {
              id: 'assault',
              name: 'Assault Brethren',
              type: 'upgrade',
              costs: [{ name: 'Detachment Points', typeId: 'dp', value: 1 }],
              categoryLinks: [{ id: 'take-and-hold', name: 'Take and Hold', targetId: 'take-and-hold' }],
              profiles: [
                {
                  id: 'assault-rule',
                  name: 'Assault Mastery',
                  typeName: 'Abilities',
                  characteristics: [{ name: 'Description', $text: 'Advance and charge.' }],
                },
              ],
            },
            {
              id: 'tacticus',
              name: 'Tacticus Attack Force',
              type: 'upgrade',
              costs: [{ name: 'Detachment Points', typeId: 'dp', value: 3 }],
              profiles: [
                {
                  id: 'rule',
                  name: 'Tactical Mastery',
                  typeName: 'Abilities',
                  characteristics: [{ name: 'Description', $text: 'Rule text' }],
                },
                {
                  id: 'stratagem',
                  name: 'Rapid Advance (1CP)',
                  typeName: 'Abilities',
                  characteristics: [{ name: 'Description', $text: 'Stratagem text' }],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    catalogue: {
      id: 'ultramarines',
      name: 'Imperium - Adeptus Astartes - Ultramarines',
      catalogueLinks: [{ targetId: 'space-marines', importRootEntries: true }],
      sharedSelectionEntries: [
        {
          id: 'guilliman',
          name: 'Roboute Guilliman',
          type: 'model',
          infoLinks: [{ id: 'doctrine-link-ultramarines', name: 'Combat Doctrines', targetId: 'doctrine', type: 'profile' }],
        },
      ],
      sharedSelectionEntryGroups: [
        {
          id: 'ultramarines-detachments',
          name: 'Ultramarines Detachment',
          selectionEntries: [
            {
              id: 'blade',
              name: 'Blade of Ultramar',
              type: 'upgrade',
              profiles: [
                {
                  id: 'blade-rule',
                  name: 'Blade of Ultramar',
                  typeName: 'Abilities',
                  characteristics: [{ name: 'Description', $text: 'Chapter rule.' }],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    catalogue: {
      id: 'dark-angels',
      name: 'Imperium - Adeptus Astartes - Dark Angels',
      catalogueLinks: [{ targetId: 'space-marines', importRootEntries: true }],
      selectionEntries: [{ id: 'lion', name: "Lion El'Jonson", type: 'unit' }],
      sharedSelectionEntries: [
        {
          id: 'dark-angels-wrapper',
          name: 'Detachment',
          type: 'upgrade',
          selectionEntryGroups: [
            {
              id: 'dark-angels-detachments',
              name: 'Dark Angels Detachment',
              selectionEntries: [{ id: 'wrath', name: 'Wrath of the Rock', type: 'upgrade' }],
            },
          ],
        },
      ],
    },
  },
]

function loadedCatalogue(source = files) {
  const prepared = prepareCatalogueProfileRules(source)
  const index = buildIndex(prepared.files, 'revision')
  const detachments = detachmentsOf(prepared.files, index)
  const loaded = {
    index,
    detachments,
    factions: factionsIn(index, detachments, prepared.replacements),
    factionContents: new Map([
      [
        'dark-angels',
        {
          name: 'Dark Angels',
          datasheets: new Set(),
          datasheetDetails: new Map(),
          datasheetIds: new Map(),
          armyRules: [
            { name: 'Combat Doctrines', description: 'Source doctrine.' },
            { name: 'Transhuman Strategist', description: 'Chapter rule.' },
          ],
          factionAbilityNames: new Set(['Combat Doctrines', 'Transhuman Strategist']),
          detachments: new Set(['Wrath of the Rock']),
          enhancements: new Map(),
          stratagems: new Map(),
          stratagemIssues: [],
          detachmentRules: new Map(),
        },
      ],
    ]),
    profiledCatalogueIds: prepared.profiledCatalogueIds,
    profiledSupplementIds: prepared.profiledSupplementIds,
    profiledDetachmentIds: prepared.profiledDetachmentIds,
    profiledArmyRules: prepared.profiledArmyRules,
  } as Partial<LoadedCatalogue> as LoadedCatalogue
  return { ...prepared, index, detachments, loaded }
}

it('loads one released Space Marines catalogue under its ordinary name', () => {
  const { index, detachments, replacements } = loadedCatalogue()
  expect(factionsIn(index, detachments, replacements).map((faction) => faction.name)).toEqual([
    'Imperium - Adeptus Astartes - Dark Angels',
    'Imperium - Adeptus Astartes - Space Marines',
    'Imperium - Adeptus Astartes - Ultramarines',
  ])
})

it('offers only the newer Space Marines book when the snapshot includes both editions', () => {
  const old = files[1]!.catalogue!
  const newer: CatalogueFile = {
    catalogue: {
      id: 'space-marines-11e',
      name: `${old.name} (11e)`,
      catalogueLinks: [{ targetId: old.id, importRootEntries: true }],
      sharedSelectionEntries: [{ id: 'new-intercessors', name: 'Intercessors', type: 'unit' }],
      sharedSelectionEntryGroups: [
        {
          id: 'new-detachments',
          name: 'Detachment',
          selectionEntries: [
            {
              id: 'new-detachment',
              name: 'New Detachment',
              type: 'upgrade',
              profiles: [{ id: 'new-rule', name: 'New Rule', characteristics: [{ name: 'Description', $text: 'Rule.' }] }],
            },
          ],
        },
      ],
    },
  }
  const { index, detachments, replacements } = loadedCatalogue([...files, newer])

  expect(factionsIn(index, detachments, replacements).map((faction) => faction.id)).toEqual([
    'dark-angels',
    'space-marines-11e',
    'ultramarines',
  ])
})

it('offers a new chapter book instead of the chapter that imports the old parent', () => {
  const newerParent: CatalogueFile = {
    catalogue: {
      id: 'space-marines-11e',
      name: `${files[1]!.catalogue!.name} (11e)`,
      sharedSelectionEntries: [{ id: 'new-intercessors', name: 'Intercessors', type: 'unit' }],
      sharedSelectionEntryGroups: [
        {
          id: 'new-parent-detachments',
          name: 'Detachment',
          selectionEntries: [
            {
              id: 'new-assault',
              name: 'Assault Brethren',
              type: 'upgrade',
              profiles: [{ id: 'new-assault-rule', name: 'Assault Mastery', characteristics: [{ name: 'Description', $text: 'Charge.' }] }],
            },
          ],
        },
      ],
    },
  }
  const newerChapter: CatalogueFile = {
    catalogue: {
      id: 'ultramarines-11e',
      name: 'Imperium - Ultramarines (11e)',
      catalogueLinks: [{ targetId: 'space-marines-11e', importRootEntries: true }],
      sharedSelectionEntries: [{ id: 'new-guilliman', name: 'Roboute Guilliman', type: 'unit' }],
      sharedSelectionEntryGroups: [
        {
          id: 'new-chapter-detachments',
          name: 'Detachment',
          selectionEntries: [
            {
              id: 'new-blade',
              name: 'Blade of Ultramar',
              type: 'upgrade',
              profiles: [{ id: 'new-blade-rule', name: 'Blade of Ultramar', characteristics: [{ name: 'Description', $text: 'Rule.' }] }],
            },
          ],
        },
      ],
    },
  }
  const { index, detachments, loaded, replacements } = loadedCatalogue([...files, newerParent, newerChapter])

  expect(factionsIn(index, detachments, replacements).map((faction) => faction.id)).toEqual([
    'dark-angels',
    'space-marines-11e',
    'ultramarines-11e',
  ])
  expect(loaded.detachments.get('ultramarines-11e')?.options.map((option) => option.name)).toContain('Assault Brethren')
})

it('replaces a chapter’s inherited legacy detachments with the new codex options', () => {
  const legacy: CatalogueFile = {
    catalogue: {
      id: 'legacy-marines',
      name: 'Imperium - Adeptus Astartes - Space Marines',
      selectionEntries: [
        {
          id: 'legacy-wrapper',
          name: 'Detachment',
          type: 'upgrade',
          selectionEntryGroups: [
            {
              id: 'legacy-choices',
              name: 'Detachment',
              selectionEntries: [
                { id: 'legacy-gladius', name: 'Gladius Task Force', type: 'upgrade' },
                {
                  id: 'chapter-angelic',
                  name: 'Angelic Inheritors',
                  type: 'upgrade',
                  modifiers: [
                    {
                      field: 'hidden',
                      type: 'set',
                      value: true,
                      conditions: [
                        { type: 'notInstanceOf', field: 'selections', scope: 'primary-catalogue', childId: 'blood-angels', value: 1 },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { id: 'legacy-unit', name: 'Intercessors', type: 'unit' },
      ],
    },
  }
  const newer: CatalogueFile = {
    catalogue: {
      id: 'new-marines',
      name: 'Imperium - Adeptus Astartes - Space Marines (11e)',
      sharedSelectionEntries: [{ id: 'new-unit', name: 'Intercessors', type: 'unit' }],
      sharedSelectionEntryGroups: [
        {
          id: 'new-detachments',
          name: 'Detachment',
          selectionEntries: [
            {
              id: 'new-assault',
              name: 'Assault Brethren',
              type: 'upgrade',
              costs: [{ name: 'Detachment Points', typeId: 'dp', value: 1 }],
              profiles: [{ id: 'new-rule', name: 'Assault Mastery', characteristics: [{ name: 'Description', $text: 'Charge.' }] }],
            },
          ],
        },
      ],
    },
  }
  const chapter: CatalogueFile = {
    catalogue: {
      id: 'blood-angels',
      name: 'Imperium - Adeptus Astartes - Blood Angels',
      catalogueLinks: [{ targetId: 'legacy-marines', importRootEntries: true }],
      selectionEntries: [{ id: 'chapter-unit', name: 'Sanguinary Guard', type: 'unit' }],
    },
  }
  const { loaded } = loadedCatalogue([files[0]!, legacy, newer, chapter])
  expect(loaded.profiledSupplementIds.has('blood-angels')).toBe(true)
  const options = loaded.detachments.get('blood-angels')!.options

  expect(options.map(({ name }) => name)).toEqual(['Angelic Inheritors', 'Assault Brethren'])
  expect(
    calculateRosterPrice(
      { catalogueId: 'blood-angels', detachmentIds: [options[1]!.id], disposition: null, limit: 2000, units: [] },
      loaded,
      null,
    ),
  ).toMatchObject({ detachments: [{ name: 'Assault Brethren', points: 1 }] })
})

it('indexes an imported profiled detachment under its owning faction once', () => {
  const { loaded } = loadedCatalogue()
  const factions = factionsFor(loaded, null).factions

  expect(
    factions
      .filter((faction) =>
        faction.referenceDetachmentIds.some((id) => faction.detachments.find((option) => option.id === id)?.name === 'Assault Brethren'),
      )
      .map((faction) => faction.id),
  ).toEqual(['space-marines'])
  expect(factions.find((faction) => faction.id === 'ultramarines')?.detachments.map((option) => option.name)).toContain('Assault Brethren')
})

it('leaves an already rooted catalogue untouched', () => {
  const option = {
    id: 'rooted-option',
    name: 'Rooted Detachment',
    type: 'upgrade' as const,
    profiles: [
      {
        id: 'rooted-rule',
        name: 'Rooted Rule',
        typeName: 'Abilities',
        characteristics: [{ name: 'Description', $text: 'Rule text.' }],
      },
    ],
  }
  const file: CatalogueFile = {
    catalogue: {
      id: 'rooted',
      name: 'Rooted',
      selectionEntries: [
        {
          id: 'rooted-wrapper',
          name: 'Detachment',
          type: 'upgrade',
          selectionEntryGroups: [{ id: 'rooted-choices', name: 'Detachment', selectionEntries: [option] }],
        },
      ],
      sharedSelectionEntries: [{ id: 'rooted-unit', name: 'Rooted Unit', type: 'unit' }],
      sharedSelectionEntryGroups: [{ id: 'rooted-shared', name: 'Detachment', selectionEntries: [option] }],
    },
  }

  const prepared = prepareCatalogueProfileRules([files[0]!, file])

  expect(prepared.files[1]).toBe(file)
  expect(prepared.profiledCatalogueIds).not.toContain('rooted')
})

it('leaves a shared rules library untouched', () => {
  const file: CatalogueFile = {
    catalogue: {
      id: 'library',
      name: 'Library - Tyranids',
      sharedSelectionEntries: [{ id: 'library-unit', name: 'Library Unit', type: 'unit' }],
      sharedSelectionEntryGroups: [
        {
          id: 'library-detachments',
          name: 'Detachment',
          selectionEntries: [
            {
              id: 'library-option',
              name: 'Library Detachment',
              type: 'upgrade',
              profiles: [
                {
                  id: 'library-rule',
                  name: 'Library Rule',
                  typeName: 'Abilities',
                  characteristics: [{ name: 'Description', $text: 'Rule text.' }],
                },
              ],
            },
          ],
        },
      ],
    },
  }

  const prepared = prepareCatalogueProfileRules([files[0]!, file])

  expect(prepared.files[1]).toBe(file)
  expect(prepared.profiledCatalogueIds).not.toContain('library')
})

it('promotes shared units to root datasheets', () => {
  const { index } = loadedCatalogue()
  expect([...index.datasheets.get('space-marines')!].map((id) => index.definitions.get(id)?.name)).toContain('Intercessors')
})

it('combines generic and chapter detachments through ordinary catalogue imports', () => {
  const { detachments } = loadedCatalogue()
  expect(detachments.get('ultramarines')?.options.map((option) => option.name)).toEqual([
    'Assault Brethren',
    'Blade of Ultramar',
    'Tacticus Attack Force',
  ])
  expect(detachments.get('dark-angels')?.options.map((option) => [option.name, option.disposition])).toEqual([
    ['Assault Brethren', 'take-and-hold'],
    ['Tacticus Attack Force', null],
    ['Wrath of the Rock', null],
  ])
})

it('uses the parent catalogue army rule for an importing chapter', () => {
  const { loaded } = loadedCatalogue()
  const darkAngels = factionsFor(loaded, null).factions.find((faction) => faction.id === 'dark-angels')!
  expect(darkAngels.armyRules).toEqual([
    { name: 'Combat Doctrines', description: 'Select a doctrine.' },
    { name: 'Transhuman Strategist', description: 'Chapter rule.' },
  ])
})

it('keeps chapter reference pages scoped to their own datasheets', () => {
  const { index, loaded } = loadedCatalogue()
  const offered = [...index.datasheets.get('ultramarines')!]
  const generic = offered.find((id) => index.definitions.get(id)?.name === 'Intercessors')!
  const own = offered.find((id) => index.definitions.get(id)?.name === 'Roboute Guilliman')!
  expect([isReferenceDatasheet(loaded, 'ultramarines', generic), isReferenceDatasheet(loaded, 'ultramarines', own)]).toEqual([false, true])
})

it('reads army rules, detachment cards, and DP costs from catalogue profiles', () => {
  const { loaded, detachments } = loadedCatalogue()
  const assault = detachments.get('space-marines')!.options.find((option) => option.name === 'Assault Brethren')!
  const tacticus = detachments.get('space-marines')!.options.find((option) => option.name === 'Tacticus Attack Force')!
  expect(isProfiledDetachment(loaded, assault.id)).toBe(true)
  expect(profiledArmyRulesFor(loaded, 'space-marines')).toEqual([{ name: 'Combat Doctrines', description: 'Select a doctrine.' }])
  expect(profiledDetachmentPoints(loaded, assault.id)).toBe(1)
  expect(profiledDetachmentCards(loaded, tacticus.id)).toEqual({
    rules: [{ id: 'rule', name: 'Tactical Mastery', description: 'Rule text' }],
    stratagems: [{ id: 'stratagem', name: 'Rapid Advance', description: 'Stratagem text', cp: 1 }],
  })
})

it('serves profiled stratagems from compiled battle detachment data', () => {
  const { loaded } = loadedCatalogue()
  const rules = {
    byDetachment: new Map(),
    detachmentDetails: new Map(),
    core: [],
    coreDetails: [],
    attribution: 'Rules source',
    dataslate: null,
  } as Partial<LoadedRules> as LoadedRules
  const data = battleDetachmentData(loaded, rules, 'space-marines')!

  expect(selectedBattleDetachmentData(data, ['Tacticus Attack Force']).written).toEqual([
    { key: 'stratagem', type: null, description: 'Stratagem text' },
  ])
})

it('uses Game Datacards details for a profiled detachment when available', () => {
  const source = files.map((file) =>
    file.catalogue?.id === 'space-marines' ? { catalogue: { ...file.catalogue, name: `${file.catalogue.name} (11e)` } } : file,
  )
  const { loaded } = loadedCatalogue(source)
  const tacticus = loaded.detachments.get('space-marines')!.options.find((option) => option.name === 'Tacticus Attack Force')!
  const stratagem = { key: 'gdc-stratagem', name: 'Rapid Advance', cp: 1, limit: 'unlimited', phases: ['movement'], turn: 'own' }
  const detail = {
    id: 'tacticus-attack-force',
    name: 'Tacticus Attack Force',
    points: 2,
    dispositions: ['take-and-hold'],
    rules: [{ name: 'Tactical Mastery', description: 'Game Datacards rule.' }],
    enhancements: [{ name: 'Chapter Champion', points: 15, description: 'Game Datacards enhancement.', keywordRestrictions: null }],
    upgrades: [],
    stratagems: [
      {
        id: 'gdc-stratagem',
        name: 'Rapid Advance',
        cp: 1,
        type: 'Battle Tactic',
        phases: ['movement'],
        turn: 'own',
        description: 'Game Datacards stratagem.',
      },
    ],
  }
  const rules = {
    factionKeys: new Map([['space-marines', 'adeptus-astartes']]),
    factionRestrictions: new Map(),
    byDetachment: new Map([['adeptus-astartes', new Map([['tacticus-attack-force', [stratagem]]])]]),
    detachmentDetails: new Map([['adeptus-astartes', new Map([['tacticus-attack-force', detail]])]]),
    detachmentReferences: new Map([
      [
        'adeptus-astartes',
        new Map([['tacticus-attack-force', { enhancements: 1, upgrades: 0, stratagems: 1, points: 2, dispositions: ['take-and-hold'] }]]),
      ],
    ]),
    dispositions: new Map([['take-and-hold', 'Take and Hold']]),
    core: [],
    coreDetails: [],
    attribution: 'Game Datacards',
    dataslate: null,
  } as Partial<LoadedRules> as LoadedRules

  expect(detachmentReference(loaded, rules, 'space-marines', 'tacticus-attack-force')).toMatchObject({
    points: 2,
    rules: detail.rules,
    enhancements: [{ name: 'Chapter Champion', points: 15 }],
    stratagems: [{ id: 'gdc-stratagem', phases: ['movement'], turn: 'own' }],
  })
  expect(selectedBattleDetachmentData(battleDetachmentData(loaded, rules, 'space-marines')!, ['Tacticus Attack Force']).stratagems).toEqual(
    [stratagem],
  )
  expect(
    factionsFor(loaded, rules)
      .factions.find((faction) => faction.id === 'space-marines')
      ?.detachments.find((detachment) => detachment.name === 'Tacticus Attack Force')?.reference,
  ).toMatchObject({ enhancements: 1, stratagems: 1 })
  expect(
    calculateRosterPrice(
      { catalogueId: 'space-marines', detachmentIds: [tacticus.id], disposition: null, limit: 2_000, units: [] },
      loaded,
      rules,
    ),
  ).toMatchObject({ detachments: [{ name: 'Tacticus Attack Force', points: 2 }], dispositions: ['take-and-hold'] })

  const conflicting = {
    ...rules,
    detachmentDetails: new Map([
      [
        'adeptus-astartes',
        new Map([['tacticus-attack-force', { ...detail, stratagems: [{ ...detail.stratagems[0]!, name: 'Another stratagem' }] }]]),
      ],
    ]),
  } as LoadedRules
  expect(detachmentReference(loaded, conflicting, 'space-marines', 'tacticus-attack-force')?.stratagems).toEqual([
    { id: 'stratagem', name: 'Rapid Advance', cp: 1, description: 'Stratagem text', type: null, phases: [], turn: null },
  ])
  expect(
    calculateRosterPrice(
      {
        catalogueId: 'space-marines',
        detachmentIds: [tacticus.id],
        disposition: null,
        limit: 2_000,
        units: [],
      },
      loaded,
      conflicting,
    ),
  ).toMatchObject({ detachments: [{ name: 'Tacticus Attack Force', points: 3 }], dispositions: [] })
})

it('recovers profile metadata from prepared catalogue files', () => {
  const { files: prepared } = loadedCatalogue()
  const index = buildIndex(prepared, 'revision')
  const metadata = catalogueProfileMetadata(prepared)
  const loaded = { index, detachments: detachmentsOf(prepared, index), ...metadata }

  expect(loaded.profiledArmyRules.get('space-marines')?.map((rule) => rule.name)).toEqual(['Combat Doctrines'])
  expect(
    loaded.detachments
      .get('dark-angels')
      ?.options.filter((option) => isProfiledDetachment(loaded, option.id))
      .map((option) => option.name),
  ).toEqual(['Assault Brethren', 'Tacticus Attack Force'])
})
