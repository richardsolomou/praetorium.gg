import { describe, expect, it } from 'vitest'
import { buildIndex, type Catalogue, type CatalogueFile } from '../core/catalogue'
import { datasheetIn, detachmentsOf, type LoadedCatalogue, unitsIn } from './catalogue'

const PTS = 'cost-pts'

const system: CatalogueFile = { gameSystem: { id: 'gs', name: 'Test', costTypes: [{ id: PTS, name: 'pts' }] } }

const points = (value: number) => [{ name: 'pts', typeId: PTS, value }]

/** A book of datasheets, as the picker sees one. */
function bookOf(catalogue: Partial<Catalogue>): LoadedCatalogue {
  const file: CatalogueFile = { catalogue: { id: 'cat', name: 'Test catalogue', ...catalogue } }
  return {
    index: buildIndex([system, file], 'test-revision'),
    factions: [{ id: 'cat', name: 'Test catalogue', references: [] }],
    detachments: new Map(),
  }
}

const categories = (...names: string[]) => names.map((name, at) => ({ id: `link-${at}`, targetId: `cat-${at}`, name }))

describe('the picker', () => {
  it('shelves a datasheet by the role its keywords claim', () => {
    const book = bookOf({
      selectionEntries: [
        { id: 'lord', name: 'Lord', type: 'model', costs: points(90), categoryLinks: categories('Infantry', 'Character') },
        { id: 'grunts', name: 'Grunts', type: 'unit', costs: points(70), categoryLinks: categories('Battleline') },
        { id: 'ride', name: 'Ride', type: 'unit', costs: points(60), categoryLinks: categories('Dedicated Transport') },
        { id: 'tank', name: 'Tank', type: 'unit', costs: points(150), categoryLinks: categories('Vehicle') },
      ],
    })
    expect(Object.fromEntries(unitsIn(book, 'cat', '').map((unit) => [unit.name, unit.group]))).toEqual({
      Lord: 'character',
      Grunts: 'battleline',
      Ride: 'transport',
      Tank: 'other',
    })
  })

  it('shelves a datasheet claiming no role at all under other', () => {
    const book = bookOf({ selectionEntries: [{ id: 'thing', name: 'Thing', type: 'unit', costs: points(10) }] })
    expect(unitsIn(book, 'cat', '')[0]?.group).toBe('other')
  })

  it('prices the smallest legal version of each datasheet', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'squad',
          name: 'Squad',
          type: 'unit',
          costs: points(0),
          selectionEntries: [
            {
              id: 'body',
              name: 'Body',
              type: 'model',
              costs: points(20),
              constraints: [{ id: 'body-min', type: 'min', value: 3, field: 'selections', scope: 'parent' }],
            },
          ],
        },
      ],
    })
    expect(unitsIn(book, 'cat', '')[0]?.points).toBe(60)
  })

  it('says nothing rather than zero for a datasheet it cannot build', () => {
    const book = bookOf({ selectionEntries: [{ id: 'ghost', name: 'Ghost', type: 'unit', costs: points(10) }] })
    // The index knows the name but the entry is not in it, so nothing can be built.
    book.index.definitions.delete('ghost')
    expect(unitsIn(book, 'cat', '')[0]?.points).toBeNull()
  })
})

describe('detachments', () => {
  it('resolve a linked group used by newer catalogues', () => {
    const file: CatalogueFile = {
      catalogue: {
        id: 'cat',
        name: 'Test catalogue',
        sharedSelectionEntries: [
          {
            id: 'wrapper',
            name: 'Detachment',
            type: 'upgrade',
            entryLinks: [{ id: 'link', name: 'Detachment', type: 'selectionEntryGroup', targetId: 'choices' }],
          },
        ],
        sharedSelectionEntryGroups: [
          {
            id: 'choices',
            name: 'Detachment',
            selectionEntries: [{ id: 'speed', name: 'Kult of Speed', type: 'upgrade' }],
          },
        ],
      },
    }
    const index = buildIndex([system, file], 'test-revision')
    expect(
      detachmentsOf([system, file], index)
        .get('cat')
        ?.options.map((option) => option.name),
    ).toEqual(['Kult of Speed'])
  })

  it('imports the group from a linked primary catalogue', () => {
    const auxiliary: CatalogueFile = {
      catalogue: {
        id: 'auxiliary',
        name: 'Auxiliary catalogue',
        sharedSelectionEntries: [
          {
            id: 'aux-wrapper',
            name: 'Detachment',
            type: 'upgrade',
            selectionEntryGroups: [
              {
                id: 'aux-choices',
                name: 'Detachment',
                selectionEntries: [{ id: 'auxiliary-force', name: 'Auxiliary Force', type: 'upgrade' }],
              },
            ],
          },
        ],
      },
    }
    const base: CatalogueFile = {
      catalogue: {
        id: 'base',
        name: 'Base catalogue',
        sharedSelectionEntries: [
          {
            id: 'wrapper',
            name: 'Detachment',
            type: 'upgrade',
            selectionEntryGroups: [
              {
                id: 'choices',
                name: 'Detachment',
                selectionEntries: [
                  { id: 'gladius', name: 'Gladius Task Force', type: 'upgrade' },
                  { id: 'anvil', name: 'Anvil Siege Force', type: 'upgrade' },
                ],
              },
            ],
          },
        ],
      },
    }
    const supplement: CatalogueFile = {
      catalogue: {
        id: 'supplement',
        name: 'Supplement',
        catalogueLinks: [{ targetId: 'auxiliary' }, { targetId: 'base' }],
      },
    }
    const files = [system, auxiliary, base, supplement]
    const index = buildIndex(files, 'test-revision')
    expect(
      detachmentsOf(files, index)
        .get('supplement')
        ?.options.map((option) => option.name),
    ).toEqual(['Anvil Siege Force', 'Gladius Task Force'])
  })
})

describe('a datasheet', () => {
  it('collects model, weapon, ability and keyword display data', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'squad',
          name: 'Squad',
          type: 'unit',
          categoryLinks: categories('Infantry', 'Battleline'),
          profiles: [{ id: 'unit', name: 'Squad', typeName: 'Unit', characteristics: [{ name: 'T', $text: '4' }] }],
          selectionEntries: [
            {
              id: 'gun',
              name: 'Rifle',
              type: 'upgrade',
              profiles: [{ id: 'weapon', name: 'Rifle', typeName: 'Ranged Weapons', characteristics: [{ name: 'A', $text: '2' }] }],
            },
          ],
        },
      ],
    })
    expect(datasheetIn(book, 'cat', 'squad')).toMatchObject({
      name: 'Squad',
      points: 0,
      keywords: ['Battleline', 'Infantry'],
      profiles: [
        { name: 'Squad', type: 'Unit', values: [{ name: 'T', value: '4' }] },
        { name: 'Rifle', type: 'Ranged Weapons', values: [{ name: 'A', value: '2' }] },
      ],
    })
  })
})
