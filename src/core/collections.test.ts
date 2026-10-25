import { describe, expect, it, vi } from 'vitest'
import { groupBy, remember, uniqueBy } from './collections'

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

describe('remember', () => {
  it('computes a null answer once', () => {
    const compute = vi.fn(() => null)
    const store = new Map<string, null>()
    remember(store, 'key', compute)
    remember(store, 'key', compute)
    expect(compute).toHaveBeenCalledTimes(1)
  })
})
