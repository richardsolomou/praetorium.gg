import { describe, expect, it } from 'vitest'
import { builtFaction, type BattleFaction } from './battleSummary'

const imperialFists: BattleFaction = { id: '5d6e-fd3-330a-11dd', slug: 'imperial-fists', displayName: 'Imperial Fists', icon: null }

describe('the army a battle fielded', () => {
  it('names a list fielded under a retired catalogue id by the faction that id moved to', () => {
    const faction = builtFaction({ catalogueId: '23d7-91c9-24dc-263a' }, new Map([[imperialFists.id, imperialFists]]))

    expect(faction?.displayName).toBe('Imperial Fists')
  })
})
