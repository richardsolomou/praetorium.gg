import { expect, it } from 'vitest'
import { buildIndex, type CatalogueFile } from '../core/catalogue'
import { detachmentsOf, factionsIn, isReferenceDatasheet, type LoadedCatalogue } from './catalogueIndex'
import { withPreviewArmyRules } from './factionReferences'
import {
  isPreviewDetachment,
  isSupersededCatalogue,
  preparePreviewCatalogues,
  previewArmyRules,
  previewDetachmentCards,
  previewDetachmentPoints,
  replacementDetachments,
} from './previewCatalogues'

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
      id: 'current',
      name: 'Imperium - Adeptus Astartes - Space Marines',
      selectionEntries: [{ id: 'current-unit', name: 'Intercessors', type: 'unit' }],
    },
  },
  {
    catalogue: {
      id: 'preview',
      name: 'Imperium - Adeptus Astartes - Space Marines (11e)',
      sharedSelectionEntries: [
        {
          id: 'preview-unit',
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
          characteristics: [{ name: 'Description', $text: 'Preview rule' }],
        },
      ],
      sharedSelectionEntryGroups: [
        {
          id: 'preview-detachments',
          name: 'Detachment',
          selectionEntries: [
            {
              id: 'assault',
              name: 'Assault Brethren',
              type: 'upgrade',
              costs: [{ name: 'Detachment Points', typeId: 'dp', value: 1 }],
              categoryLinks: [{ id: 'take-and-hold', name: 'Take and Hold', targetId: 'take-and-hold' }],
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
      id: 'chapter',
      name: 'Ultramarines (11e)',
      catalogueLinks: [{ targetId: 'preview', importRootEntries: true }],
      sharedSelectionEntries: [{ id: 'guilliman', name: 'Roboute Guilliman', type: 'model' }],
      sharedSelectionEntryGroups: [
        {
          id: 'chapter-detachments',
          name: 'Ultramarines Detachment',
          selectionEntries: [{ id: 'blade', name: 'Blade of Ultramar', type: 'upgrade' }],
        },
      ],
    },
  },
  {
    catalogue: {
      id: 'current-chapter',
      name: 'Dark Angels',
      catalogueLinks: [{ targetId: 'current', importRootEntries: true }],
      selectionEntries: [{ id: 'lion', name: "Lion El'Jonson", type: 'unit' }],
      sharedSelectionEntries: [
        {
          id: 'current-chapter-wrapper',
          name: 'Detachment',
          type: 'upgrade',
          selectionEntryGroups: [
            {
              id: 'current-chapter-detachments',
              name: 'Dark Angels Detachment',
              selectionEntries: [{ id: 'wrath', name: 'Wrath of the Rock', type: 'upgrade' }],
            },
          ],
        },
      ],
    },
  },
]

it('loads both source books while marking the previous book as superseded', () => {
  const index = buildIndex(preparePreviewCatalogues(files), 'revision')
  const factions = factionsIn(index, detachmentsOf(preparePreviewCatalogues(files), index))
  const loaded = { index } as LoadedCatalogue
  expect(factions.map((faction) => [faction.id, isSupersededCatalogue(loaded, faction)])).toEqual([
    ['current-chapter', false],
    ['current', true],
    ['preview', false],
    ['chapter', false],
  ])
})

it('offers generic and chapter detachments to preview chapters', () => {
  const prepared = preparePreviewCatalogues(files)
  const index = buildIndex(prepared, 'revision')
  expect(
    detachmentsOf(prepared, index)
      .get('chapter')
      ?.options.map((option) => option.name),
  ).toEqual(['Assault Brethren', 'Blade of Ultramar', 'Tacticus Attack Force'])
})

it('offers preview Space Marines detachments to current chapter supplements', () => {
  const prepared = preparePreviewCatalogues(files)
  const index = buildIndex(prepared, 'revision')

  expect(
    detachmentsOf(prepared, index)
      .get('current-chapter')
      ?.options.map((option) => [option.name, option.disposition]),
  ).toEqual([
    ['Assault Brethren', 'take-and-hold'],
    ['Tacticus Attack Force', null],
    ['Wrath of the Rock', null],
  ])
})

it('leaves established catalogue entries untouched', () => {
  expect(preparePreviewCatalogues(files)[1]).toBe(files[1])
})

it('replaces inherited detachments while retaining a chapter supplement', () => {
  const prepared = preparePreviewCatalogues(files)
  const index = buildIndex(prepared, 'revision')
  const detachments = detachmentsOf(prepared, index)
  const loaded = { index, detachments } as LoadedCatalogue
  const assault = detachments.get('current-chapter')!.options.find((option) => option.name === 'Assault Brethren')!
  const faction = {
    name: 'Dark Angels',
    detachments: [...detachments.get('current-chapter')!.options, { id: 'old-generic', name: 'Old Generic' }],
    referenceDetachmentIds: ['wrath'],
  }

  expect(isPreviewDetachment(loaded, assault.id)).toBe(true)
  expect(replacementDetachments(loaded, faction).detachments.map((option) => option.name)).toEqual([
    'Assault Brethren',
    'Tacticus Attack Force',
    'Wrath of the Rock',
  ])
})

it('replaces a current chapter parent ability with the preview army rule', () => {
  const prepared = preparePreviewCatalogues(files)
  const index = buildIndex(prepared, 'revision')
  const detachments = detachmentsOf(prepared, index)
  const loaded = {
    index,
    detachments,
    previewArmyRules: new Map([['preview', [{ name: 'Combat Doctrines', description: 'Preview rule' }]]]),
    factionContents: new Map([
      [
        'dark-angels',
        {
          factionAbilityNames: new Set(['Oath of Moment']),
        },
      ],
    ]),
  } as Partial<LoadedCatalogue> as LoadedCatalogue
  const faction = {
    id: 'current-chapter',
    name: 'Dark Angels',
    detachments: detachments.get('current-chapter')!.options,
    armyRules: [
      { name: 'Oath of Moment', description: 'Current parent rule' },
      { name: 'The Unforgiven', description: 'Chapter rule' },
    ],
  }

  expect(withPreviewArmyRules(loaded, faction).armyRules).toEqual([
    { name: 'Combat Doctrines', description: 'Preview rule' },
    { name: 'The Unforgiven', description: 'Chapter rule' },
  ])
})

it('keeps preview chapter references to their own datasheets', () => {
  const index = buildIndex(preparePreviewCatalogues(files), 'revision')
  const loaded = { index } as LoadedCatalogue
  const offered = [...(index.datasheets.get('chapter') ?? [])]
  const generic = offered.find((id) => {
    const entry = index.definitions.get(id)
    return entry && 'targetId' in entry && entry.targetId === 'preview-unit'
  })
  const own = offered.find((id) => {
    const entry = index.definitions.get(id)
    return entry && 'targetId' in entry && entry.targetId === 'guilliman'
  })
  expect([isReferenceDatasheet(loaded, 'chapter', generic!), isReferenceDatasheet(loaded, 'chapter', own!)]).toEqual([false, true])
})

it('reads preview army rules from the catalogue profiles', () => {
  expect(previewArmyRules(files).get('preview')).toEqual([{ name: 'Combat Doctrines', description: 'Preview rule' }])
})

it('separates preview detachment rules and costed stratagems', () => {
  const prepared = preparePreviewCatalogues(files)
  const index = buildIndex(prepared, 'revision')
  const loaded = { index } as LoadedCatalogue
  const option = detachmentsOf(prepared, index)
    .get('preview')
    ?.options.find((candidate) => candidate.name === 'Tacticus Attack Force')
  expect(previewDetachmentCards(loaded, option!.id)).toEqual({
    rules: [{ id: 'rule', name: 'Tactical Mastery', description: 'Rule text' }],
    stratagems: [{ id: 'stratagem', name: 'Rapid Advance', description: 'Stratagem text', cp: 1 }],
  })
})

it('reads preview detachment points from the source cost type', () => {
  const prepared = preparePreviewCatalogues(files)
  const index = buildIndex(prepared, 'revision')
  const loaded = { index } as LoadedCatalogue
  const option = detachmentsOf(prepared, index).get('preview')?.options[0]
  expect(previewDetachmentPoints(loaded, option!.id)).toBe(1)
})
