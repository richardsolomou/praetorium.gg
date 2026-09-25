import { expect, it } from 'vitest'
import { buildIndex, type CatalogueFile } from '../core/catalogue'
import { detachmentsOf, factionsIn, isReferenceDatasheet, type LoadedCatalogue } from './catalogueIndex'
import {
  isProfiledDetachment,
  prepareCatalogueProfileRules,
  profiledArmyRulesFor,
  profiledDetachmentCards,
  profiledDetachmentPoints,
} from './catalogueProfileRules'
import { factionsFor } from './factionReferences'

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

function loadedCatalogue() {
  const prepared = prepareCatalogueProfileRules(files)
  const index = buildIndex(prepared.files, 'revision')
  const detachments = detachmentsOf(prepared.files, index)
  const loaded = {
    index,
    detachments,
    factions: factionsIn(index, detachments),
    factionContents: new Map([
      [
        'dark-angels',
        {
          name: 'Dark Angels',
          datasheets: new Set(),
          datasheetDetails: new Map(),
          datasheetIds: new Map(),
          armyRules: [{ name: 'Oath of Moment', description: 'Choose a target.' }],
          factionAbilityNames: new Set(['Oath of Moment']),
          detachments: new Set(['Wrath of the Rock']),
          enhancements: new Map(),
          detachmentRules: new Map(),
        },
      ],
    ]),
    profiledCatalogueIds: prepared.profiledCatalogueIds,
    profiledDetachmentIds: prepared.profiledDetachmentIds,
    profiledArmyRules: prepared.profiledArmyRules,
  } as Partial<LoadedCatalogue> as LoadedCatalogue
  return { ...prepared, index, detachments, loaded }
}

it('loads one released Space Marines catalogue under its ordinary name', () => {
  const { index, detachments } = loadedCatalogue()
  expect(factionsIn(index, detachments).map((faction) => faction.name)).toEqual([
    'Imperium - Adeptus Astartes - Dark Angels',
    'Imperium - Adeptus Astartes - Space Marines',
    'Imperium - Adeptus Astartes - Ultramarines',
  ])
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
  expect(darkAngels.armyRules).toEqual([{ name: 'Combat Doctrines', description: 'Select a doctrine.' }])
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
