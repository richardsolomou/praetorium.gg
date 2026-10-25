import { expect, it } from 'vitest'
import { bookOf, PTS, points } from './catalogue.fixtures'
import { calculateRosterPrice } from '../shared/pricing'

// A points cap on a keyword, as BSData caps the Deathwatch a chapter may take at 500 points.
const book = (catalogued: number, priced: number) => {
  const loaded = bookOf({
    categoryEntries: [
      {
        id: 'ally-keyword',
        name: 'Faction: Ally',
        constraints: [{ id: 'ally-cap', type: 'max', value: 150, field: PTS, scope: 'roster', includeChildSelections: true }],
      },
    ],
    selectionEntries: [
      {
        id: 'veteran',
        name: 'Veteran',
        type: 'unit',
        costs: points(catalogued),
        categoryLinks: [{ id: 'veteran-ally', targetId: 'ally-keyword', name: 'Faction: Ally', primary: false }],
      },
    ],
  })
  loaded.mfm = new Map([
    [
      'test-catalogue',
      {
        slug: 'test-catalogue',
        version: '1.6',
        units: [{ name: 'Veteran', pricing: [{ range: '[1,)', costs: [{ models: 1, points: priced }] }] }],
      },
    ],
  ])
  return loaded
}

const errors = (loaded: ReturnType<typeof book>, copies: number) =>
  calculateRosterPrice(
    {
      catalogueId: 'cat',
      detachmentIds: [],
      disposition: null,
      limit: 2000,
      units: Array.from({ length: copies }, () => ({ entryId: 'veteran' })),
    },
    loaded,
    null,
  )!.errors.map((error) => `${error.entryName}: ${error.message}`)

it('caps a keyword by what its units cost the list', () => {
  expect(errors(book(50, 100), 2)).toEqual(['Faction: Ally: allows at most 150 points, has 200'])
})

it('accepts a keyword within its cap at the list price', () => {
  expect(errors(book(100, 50), 2)).toEqual([])
})
