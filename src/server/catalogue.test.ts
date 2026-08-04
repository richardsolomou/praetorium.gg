import { describe, expect, it } from 'vitest'
import { buildIndex, type Catalogue, type CatalogueFile } from '../core/catalogue'
import { type LoadedCatalogue, unitsIn } from './catalogue'

const PTS = 'cost-pts'

const system: CatalogueFile = { gameSystem: { id: 'gs', name: 'Test', costTypes: [{ id: PTS, name: 'pts' }] } }

const points = (value: number) => [{ name: 'pts', typeId: PTS, value }]

/** A book of datasheets, as the picker sees one. */
function bookOf(catalogue: Partial<Catalogue>): LoadedCatalogue {
  const file: CatalogueFile = { catalogue: { id: 'cat', name: 'Test catalogue', ...catalogue } }
  return { index: buildIndex([system, file], 'test-revision'), factions: [{ id: 'cat', name: 'Test catalogue' }], detachments: new Map() }
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
