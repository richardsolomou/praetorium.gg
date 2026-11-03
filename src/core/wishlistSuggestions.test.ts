import { describe, expect, it } from 'vitest'
import { wishlistSuggestions } from './wishlistSuggestions'

const roster = (...entryIds: string[]) => ({ entryIds })
const army = (rosters: { entryIds: string[] }[], catalogueId = 'necrons') => ({ catalogueId, rosters })

describe('wishlist suggestions', () => {
  it('suggests a datasheet other players field that none of the player’s rosters use, for the army that fields it', () => {
    expect(wishlistSuggestions([roster('warriors')], [army([roster('warriors', 'scarabs')])])).toEqual([
      { entryId: 'scarabs', catalogueId: 'necrons', rosters: 1, of: 1 },
    ])
  })

  it('counts a datasheet once per roster that fields it', () => {
    expect(wishlistSuggestions([], [army([roster('scarabs', 'scarabs')])])[0]?.rosters).toBe(1)
  })

  it('counts each army against its own rosters', () => {
    expect(
      wishlistSuggestions([], [army([roster('scarabs'), roster('wraiths')]), army([roster('termagants')], 'tyranids')]).find(
        (row) => row.entryId === 'termagants',
      )?.of,
    ).toBe(1)
  })

  it('leads with the datasheet the largest share of its army’s rosters field', () => {
    expect(
      wishlistSuggestions(
        [],
        [army([roster('wraiths'), roster('scarabs', 'wraiths'), roster()]), army([roster('termagants')], 'tyranids')],
      ).map((row) => row.entryId),
    ).toEqual(['termagants', 'wraiths', 'scarabs'])
  })
})
