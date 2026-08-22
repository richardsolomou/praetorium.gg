import { describe, expect, it } from 'vitest'
import { addedKeywords, compositionCount, displayAbilities } from './datasheet'

describe('datasheet composition count', () => {
  it('adds fixed and ranged model groups', () => {
    expect(compositionCount(['**1 Deathwing Sergeant**', '**4-9 Deathwing Terminators**'])).toBe('5–10 models')
  })

  it('keeps a single-model datasheet singular', () => {
    expect(compositionCount(['**1 Overlord**'])).toBe('1 model')
  })
})

describe('datasheet abilities', () => {
  it('leaves attachment roles to the dedicated attachment section', () => {
    const abilities = [
      { name: 'Leader', kind: 'core' },
      { name: 'Support', kind: 'rule' },
      { name: 'My Will Be Done', kind: 'datasheet' },
    ]

    expect(displayAbilities(abilities)).toEqual([abilities[2]])
  })
})

describe('the keywords something in the list added to a weapon', () => {
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
