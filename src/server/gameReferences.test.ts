import { describe, expect, it } from 'vitest'
import { gameReferencesFor } from '../shared/gameReferences'
import type { LoadedRules } from './rules'

describe('game references built from a stale rules object', () => {
  it('name the disposition slug back when the map is absent', () => {
    // A memoized rules object built before the dispositions map existed keeps no map.
    // The reader must fall back to the slug rather than throw on the missing map.
    const stale = {
      missions: new Map([['legacy|attackers|defenders', { id: 'm1', source: 'Pack' }]]),
      primaries: [],
      secondaries: [],
      deployments: [],
      attribution: null,
    } as unknown as LoadedRules

    const references = gameReferencesFor(stale)

    expect(references.dispositions).toEqual([])
    expect(references.packs[0]?.missions[0]?.matchups).toEqual([
      [
        { id: 'attackers', name: 'attackers' },
        { id: 'defenders', name: 'defenders' },
      ],
    ])
  })
})

describe('secondary mission slugs', () => {
  const slugs = (names: string[]) =>
    gameReferencesFor({
      missions: new Map(),
      primaries: [],
      secondaries: names.map((name, index) => ({ key: `key-${index}`, name })),
      deployments: [],
      attribution: null,
    } as unknown as LoadedRules).secondaries.map((card) => card.slug)

  it('use the name slug when no other card shares it', () => {
    expect(slugs(['Behind Enemy Lines'])).toEqual(['behind-enemy-lines'])
  })

  it('fall back to the source key when names share a slug', () => {
    expect(slugs(['Assassination', 'Variant - Assassination'])).toEqual(['key-0', 'key-1'])
  })
})
