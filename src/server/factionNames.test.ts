import { describe, expect, it } from 'vitest'
import type { LoadedCatalogue } from './catalogueIndex'
import { factionContentOf, factionDisplayName } from './factionNames'

describe('faction display names', () => {
  const names = new Map([
    ['agents-of-the-imperium', 'Imperial Agents'],
    ['imperial-knights', 'Imperial Knights'],
  ])

  it('uses the rules source name for a catalogue faction', () => {
    expect(factionDisplayName('Imperium - Agents of the Imperium', names)).toBe('Imperial Agents')
  })

  it('resolves a library through its owning faction name', () => {
    expect(factionDisplayName('Imperium - Imperial Knights - Library', names)).toBe('Imperial Knights')
  })

  it('shows an edition-labelled replacement under the ordinary faction name', () => {
    expect(factionDisplayName('Imperium - Adeptus Astartes - Space Marines (11e)')).toBe('Space Marines')
  })
})

it('resolves provisional edition-labelled catalogues to their Game Datacards faction', () => {
  const loaded = {
    factionContents: new Map([['space-marines', { name: 'Adeptus Astartes' }]]),
  } as unknown as LoadedCatalogue

  expect(factionContentOf(loaded, 'Imperium - Adeptus Astartes - Space Marines (11e)')?.name).toBe('Adeptus Astartes')
})
