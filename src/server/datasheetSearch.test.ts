import { describe, expect, it } from 'vitest'
import { matchDatasheet } from './datasheetSearch'

const fields = {
  name: 'Technomancer',
  keywords: ['Character', 'Cryptek'],
  abilities: ['Rites of Reanimation'],
  weapons: ['Staff of light'],
  weaponKeywords: ['Assault', 'Lethal Hits'],
  wargear: ['Canoptek cloak'],
}

describe('datasheet search', () => {
  it('matches words across structured fields', () => {
    expect(matchDatasheet('cryptek staff', fields)?.reasons).toEqual([
      { kind: 'keyword', value: 'Cryptek' },
      { kind: 'weapon', value: 'Staff of light' },
    ])
  })

  it('normalizes punctuation and partial words', () => {
    expect(matchDatasheet('rites-reanim', fields)?.reasons).toEqual([{ kind: 'ability', value: 'Rites of Reanimation' }])
  })

  it('returns no more than three reasons', () => {
    expect(
      matchDatasheet('one two three four', {
        name: 'Overlord',
        keywords: ['One'],
        abilities: ['Two'],
        weapons: ['Three'],
        weaponKeywords: ['Four'],
        wargear: [],
      })?.reasons,
    ).toEqual([
      { kind: 'keyword', value: 'One' },
      { kind: 'ability', value: 'Two' },
      { kind: 'weapon', value: 'Three' },
    ])
  })

  it('returns the smallest set of reasons that explains the query', () => {
    expect(
      matchDatasheet('destroyer cult', {
        name: 'Hexmark',
        keywords: ['Destroyer Cult', 'Hexmark Destroyer'],
        abilities: [],
        weapons: [],
        weaponKeywords: [],
        wargear: [],
      })?.reasons,
    ).toEqual([{ kind: 'keyword', value: 'Destroyer Cult' }])
  })

  it('finds the smallest explanation when a greedy choice would use three reasons', () => {
    expect(
      matchDatasheet('alpha beta gamma delta epsilon zeta', {
        name: 'Overlord',
        keywords: ['Alpha beta gamma delta'],
        abilities: ['Alpha beta epsilon'],
        weapons: ['Gamma delta zeta'],
        weaponKeywords: [],
        wargear: [],
      })?.reasons,
    ).toEqual([
      { kind: 'ability', value: 'Alpha beta epsilon' },
      { kind: 'weapon', value: 'Gamma delta zeta' },
    ])
  })

  it('does not match unrelated words', () => {
    expect(matchDatasheet('tesla', fields)).toBeNull()
  })

  it('ranks names ahead of metadata', () => {
    const name = matchDatasheet('technomancer', fields)
    const keyword = matchDatasheet('cryptek', fields)

    expect(name?.score).toBeLessThan(keyword?.score ?? Infinity)
    expect(name?.reasons).toEqual([])
  })
})
