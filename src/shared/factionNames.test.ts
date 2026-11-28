import { expect, it } from 'vitest'
import { factionContentsOf, factionDisplayName, factionSlugOf } from './factionNames'
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

it.each([
  ['Legiones Daemonica', 'chaos-daemons'],
  ['heretic-astartes', 'chaos-space-marines'],
  ['chaos-daemons', 'chaos-daemons'],
])('reads the VS Data faction name %s as the army slug %s a battle filter takes', (named, slug) => {
  const factions = [
    { displayName: 'Chaos Daemons', vsFaction: { id: 'chaos-daemons', name: 'Legiones Daemonica' } },
    { displayName: 'Chaos Space Marines', vsFaction: { id: 'chaos-space-marines', name: 'Heretic Astartes' } },
  ]
  expect(factionSlugOf(named, factions)).toBe(slug)
})
