import { describe, expect, it } from 'vitest'
import { wishlistSuggestions } from './wishlistSuggestions'

const roster = (...entryIds: string[]) => ({ entryIds })
const army = (rosters: { entryIds: string[] }[], datasheets: string[] = []) => ({
  rosters,
  datasheets: datasheets.map((id) => ({ id, name: id })),
})

describe('wishlist suggestions', () => {
  it('suggests a datasheet other players field that none of the player’s rosters use', () => {
    expect(wishlistSuggestions([roster('warriors')], [army([roster('warriors', 'scarabs')])])).toEqual([
      { entryId: 'scarabs', rosters: 1, of: 1 },
    ])
  })

  it('counts a datasheet once per roster that fields it', () => {
    expect(wishlistSuggestions([], [army([roster('scarabs', 'scarabs')])])[0]?.rosters).toBe(1)
  })

  it('counts each army against its own rosters', () => {
    expect(
      wishlistSuggestions([], [army([roster('scarabs'), roster('wraiths')]), army([roster('termagants')])]).find(
        (row) => row.entryId === 'termagants',
      )?.of,
    ).toBe(1)
  })

  it('leads with the datasheet the largest share of its army’s rosters field', () => {
    expect(
      wishlistSuggestions([], [army([roster('wraiths'), roster('scarabs', 'wraiths'), roster()]), army([roster('termagants')])]).map(
        (row) => row.entryId,
      ),
    ).toEqual(['termagants', 'wraiths', 'scarabs'])
  })

  it('suggests an army’s unused datasheets when no other player’s roster is found', () => {
    expect(wishlistSuggestions([roster('warriors')], [army([], ['warriors', 'scarabs'])])).toEqual([
      { entryId: 'scarabs', rosters: 0, of: 0 },
    ])
  })

  it('leaves out an army’s other datasheets once other players’ rosters are found', () => {
    expect(wishlistSuggestions([], [army([roster('scarabs')], ['scarabs', 'wraiths'])]).map((row) => row.entryId)).toEqual(['scarabs'])
  })

  it('lists unfielded datasheets after fielded ones, by name', () => {
    expect(
      wishlistSuggestions([], [army([], ['wraiths', 'lychguard']), army([roster('termagants'), roster()])]).map((row) => row.entryId),
    ).toEqual(['termagants', 'lychguard', 'wraiths'])
  })
})
