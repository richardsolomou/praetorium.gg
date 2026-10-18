import { expect, it } from 'vitest'
import { exampleMatchup } from './matchupHistory'

const index = [
  {
    name: 'Space Marines',
    catalogueId: 'marines',
    units: [{ id: 'intercessors', slug: 'intercessors', name: 'Intercessor Squad', points: 80 }],
  },
  { name: 'Necrons', catalogueId: 'necrons', units: [{ id: 'warriors', slug: 'warriors', name: 'Necron Warriors', points: 90 }] },
]

it('resolves the editable example against the current catalogue rather than stored IDs', () => {
  expect(exampleMatchup(index)?.sides.map((side) => [side?.catalogueId, side?.pick.entryId])).toEqual([
    ['marines', 'intercessors'],
    ['necrons', 'warriors'],
  ])
})

it('offers no example when either exact unit is unavailable', () => {
  expect(exampleMatchup(index.slice(0, 1))).toBeNull()
})
