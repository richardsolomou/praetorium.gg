import { expect, it } from 'vitest'
import { factionContentsOf, factionDisplayName } from './factionNames'
import { shelfOf, withCards } from '../server/catalogue.fixtures'

it('resolves a retained synthetic Marine book to its original faction points identity', () => {
  expect(factionDisplayName('Imperium - Ultramarines (11e)')).toBe('Ultramarines')
})

it('reads retained book references from the same faction card source', () => {
  const loaded = shelfOf()
  const cards = withCards('Ultramarines', [])
  loaded.factionContents.set('ultramarines', cards)
  expect(factionContentsOf(loaded, 'Imperium - Ultramarines (11e)')).toEqual([cards])
})
