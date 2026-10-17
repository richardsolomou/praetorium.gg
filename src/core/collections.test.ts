import { describe, expect, it } from 'vitest'
import { groupBy, uniqueBy } from './collections'

describe('groupBy', () => {
  it('gathers entries under their key in first-seen order', () => {
    expect([...groupBy(['apple', 'bean', 'avocado'], (word) => word[0])]).toEqual([
      ['a', ['apple', 'avocado']],
      ['b', ['bean']],
    ])
  })
})

describe('uniqueBy', () => {
  it('keeps the first value for each key', () => {
    expect(uniqueBy(['Bolter', 'bolter', 'Melta'], (name) => name.toLowerCase())).toEqual(['Bolter', 'Melta'])
  })
})
