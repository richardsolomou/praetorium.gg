import { describe, expect, it } from 'vitest'
import { factionSelectGroups, shortName } from './factions'

describe('faction names', () => {
  it('removes catalogue lineage and implementation suffixes', () => {
    expect(shortName('Imperium - Imperial Knights - Library')).toBe('Imperial Knights')
  })

  it('uses the ordinary faction name for a replacement book', () => {
    expect(shortName('Imperium - Adeptus Astartes - Space Marines (11e)')).toBe('Space Marines')
  })

  it('uses the ordinary faction name in the rendered option', () => {
    const groups = factionSelectGroups(
      [
        {
          id: 'replacement',
          name: 'Imperium - Adeptus Astartes - Space Marines (11e)',
          slug: 'space-marines-11e',
          displayName: 'Space Marines (11e)',
        },
      ],
      new Set(),
    )
    expect(groups[0]?.items[0]?.faction?.displayName).toBe('Space Marines')
  })
})
