import { describe, expect, it } from 'vitest'
import { addedKeywords, compositionCount, referenceAbilities, rosterAbilities } from './datasheet'

describe('datasheet composition count', () => {
  it('adds fixed and ranged model groups', () => {
    expect(compositionCount(['**1 Deathwing Sergeant**', '**4-9 Deathwing Terminators**'])).toBe('5–10 models')
  })

  it('keeps a single-model datasheet singular', () => {
    expect(compositionCount(['**1 Overlord**'])).toBe('1 model')
  })

  it('totals each fixed composition without adding alternatives together', () => {
    expect(
      compositionCount(['**1 Shock Trooper Sergeant and 9 Shock Troopers**', 'OR', '**2 Shock Trooper Sergeants and 18 Shock Troopers**']),
    ).toBe('10–20 models')
  })
})

describe('datasheet abilities', () => {
  it('keeps attachment keywords on reference datasheets without repeating their rules', () => {
    const abilities = [
      { name: 'Leader', kind: 'core' },
      { name: 'Leader', kind: 'rule' },
      { name: 'Support', kind: 'core' },
      { name: 'Support', kind: 'rule' },
      { name: 'My Will Be Done', kind: 'datasheet' },
    ]

    expect(referenceAbilities(abilities, [{ kind: 'leader' }, { kind: 'support' }])).toEqual([abilities[0], abilities[2], abilities[4]])
  })

  it('keeps an attachment rule when the datasheet has no parsed targets', () => {
    const abilities = [{ name: 'Leader', kind: 'rule' }]

    expect(referenceAbilities(abilities, [])).toEqual(abilities)
  })

  it('leaves attachment roles out of the roster editor', () => {
    const abilities = [
      { name: 'Leader', kind: 'core' },
      { name: 'Support', kind: 'core' },
      { name: 'My Will Be Done', kind: 'datasheet' },
    ]

    expect(rosterAbilities(abilities)).toEqual([abilities[2]])
  })
})

describe('the keywords something in the list added to a weapon', () => {
  it('names a keyword added to a blank printed characteristic', () => {
    expect(addedKeywords({ value: 'Lethal Hits', baseValue: '' })).toEqual(['Lethal Hits'])
  })

  it('names what the printed profile does not have', () => {
    expect(addedKeywords({ value: 'Lethal Hits, Assault', baseValue: 'Lethal Hits' })).toEqual(['Assault'])
  })

  it('names nothing on an unmodified profile', () => {
    expect(addedKeywords({ value: 'Lethal Hits' })).toEqual([])
  })

  it('reads a non-breaking space as the separator the catalogue joined with', () => {
    expect(addedKeywords({ value: 'Lethal Hits,\u00a0Assault', baseValue: 'Lethal Hits' })).toEqual(['Assault'])
  })
})
