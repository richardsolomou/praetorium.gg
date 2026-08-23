import { describe, expect, it } from 'vitest'
import type { Roster, Stratagem } from '../core/battle'
import { STRATAGEMS_MAX } from '../core/battle'
import { armyRulesRequest, sideStratagems } from './sideRules'

const stratagem = (key: string): Stratagem => ({ key, name: key, cp: 1, limit: 'unlimited' })

const built = (over: Partial<NonNullable<Roster['built']>>): Roster => ({
  name: 'A list',
  text: '',
  built: { catalogueId: 'cat', revision: 'rev', limit: 2000, detachment: null, disposition: null, units: [], ...over },
})

describe('armyRulesRequest', () => {
  it('names every detachment a list bought, in the order it bought them', () => {
    expect(
      armyRulesRequest(
        built({
          detachment: 'Gladius Task Force',
          detachments: [
            { name: 'Gladius Task Force', points: 0 },
            { name: 'Anvil Siege Force', points: 0 },
          ],
        }),
      ),
    ).toEqual({ catalogueId: 'cat', detachmentNames: ['Gladius Task Force', 'Anvil Siege Force'] })
  })

  it('falls back to the single detachment an older log names', () => {
    expect(armyRulesRequest(built({ detachment: 'Gladius Task Force' }))).toEqual({
      catalogueId: 'cat',
      detachmentNames: ['Gladius Task Force'],
    })
  })

  it('asks for nothing on behalf of a seat with no list yet', () => {
    expect(armyRulesRequest(null)).toEqual({ catalogueId: '', detachmentNames: [] })
  })
})

describe('sideStratagems', () => {
  const brought = (detachment: string, ...keys: string[]) => ({ detachments: [detachment], stratagems: keys.map(stratagem) })

  it('pools both allies’ detachments so a 2v1 plays what each ally brought', () => {
    const pooled = sideStratagems([brought('Gladius', 'oath', 'honour'), brought('Hypercrypt', 'reanimate')], [stratagem('overwatch')])

    expect(pooled.map((entry) => entry.key)).toEqual(['oath', 'honour', 'reanimate', 'overwatch'])
  })

  // Each ally's detachment rules affect their own army and the enemy, never their
  // ally's, so the pool has to keep saying which of the two a card came from.
  it('names the detachment each pooled card came from, and none for a core card', () => {
    const pooled = sideStratagems([brought('Gladius', 'oath'), brought('Hypercrypt', 'reanimate')], [stratagem('overwatch')])

    expect(pooled.map((entry) => [entry.key, entry.detachment])).toEqual([
      ['oath', 'Gladius'],
      ['reanimate', 'Hypercrypt'],
      ['overwatch', undefined],
    ])
  })

  it('brings a detachment two allies share once rather than twice', () => {
    const pooled = sideStratagems(
      [brought('Gladius', 'oath'), brought('Gladius', 'oath')],
      [stratagem('overwatch'), stratagem('overwatch')],
    )

    expect(pooled.map((entry) => entry.key)).toEqual(['oath', 'overwatch'])
  })

  it('holds a pool no bigger than a side may record', () => {
    const many = Array.from({ length: STRATAGEMS_MAX + 4 }, (_, at) => stratagem(`s${at}`))

    expect(sideStratagems([{ detachments: ['Gladius'], stratagems: many }], [stratagem('overwatch')])).toHaveLength(STRATAGEMS_MAX)
  })
})
