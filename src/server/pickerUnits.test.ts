import { describe, expect, it } from 'vitest'
import { points, shelfOf } from './catalogue.fixtures'
import { booksOffering } from '../shared/pickerUnits'

describe('the books that offer a datasheet', () => {
  const shelf = shelfOf(
    {
      selectionEntries: [
        { id: 'squad', name: 'Squad', type: 'unit', costs: points(70) },
        { id: 'old', name: 'Land Speeder [Legends]', type: 'unit', costs: points(60) },
      ],
    },
    { selectionEntries: [{ id: 'other', name: 'Other Squad', type: 'unit', costs: points(80) }] },
  )

  it('are the ones whose picker lists it', () => {
    expect(booksOffering(shelf, null, 'squad', ['cat', 'cat-1'])).toEqual(['cat'])
  })

  it('exclude every book for a Legends datasheet', () => {
    expect(booksOffering(shelf, null, 'old', ['cat', 'cat-1'])).toEqual([])
  })

  it('exclude a book the catalogue does not hold', () => {
    expect(booksOffering(shelf, null, 'squad', ['retired'])).toEqual([])
  })
})
