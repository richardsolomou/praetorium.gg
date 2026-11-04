import { expect, it } from 'vitest'
import { points, shelfOf } from './catalogue.fixtures'
import { calculateRosterPrice } from '../shared/pricing'

it('fields a unit the army imports from another book in the army itself when its pick names no book', () => {
  const shelf = shelfOf(
    {
      selectionEntries: [{ id: 'ours', name: 'Ours', type: 'unit', costs: points(10) }],
      catalogueLinks: [{ targetId: 'cat-1', importRootEntries: true }],
    },
    { selectionEntries: [{ id: 'theirs', name: 'Theirs', type: 'unit', costs: points(20) }] },
  )
  const price = calculateRosterPrice(
    { catalogueId: 'cat', detachmentIds: [], disposition: null, limit: 2000, units: [{ entryId: 'ours' }, { entryId: 'theirs' }] },
    shelf,
    null,
  )
  expect(price?.unhandled).toEqual([])
})
