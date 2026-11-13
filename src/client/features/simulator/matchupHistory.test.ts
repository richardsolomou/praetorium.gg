import { expect, it } from 'vitest'
import { exampleMatchup } from './matchupHistory'

const index = [
  {
    name: 'Space Marines',
    catalogueId: 'marines',
    units: [
      { id: 'intercessors', slug: 'intercessors', name: 'Intercessor Squad', points: 80 },
      { id: 'captain', slug: 'captain', name: 'Captain', points: 90 },
      { id: 'lieutenant', slug: 'lieutenant', name: 'Lieutenant', points: 65 },
    ],
  },
  {
    name: 'Necrons',
    catalogueId: 'necrons',
    units: [
      { id: 'lychguard', slug: 'lychguard', name: 'Lychguard', points: 80 },
      { id: 'overlord', slug: 'overlord', name: 'Overlord', points: 85 },
    ],
  },
]

it('resolves the editable example against the current catalogue rather than stored IDs', () => {
  expect(exampleMatchup(index)?.sides.map((side) => [side?.pick.entryId, ...(side?.attached ?? []).map(({ entryId }) => entryId)])).toEqual(
    [
      ['intercessors', 'captain', 'lieutenant'],
      ['lychguard', 'overlord'],
    ],
  )
})

it('offers no example when either exact unit is unavailable', () => {
  expect(exampleMatchup([index[0]!, { ...index[1]!, units: index[1]!.units.slice(0, 1) }])).toBeNull()
})
