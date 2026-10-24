import { describe, expect, it } from 'vitest'
import { keptRosterArrangement } from './rosterArrangement'

describe('keptRosterArrangement', () => {
  it('shows attached units together until a player chooses otherwise', () => {
    expect(keptRosterArrangement(undefined)).toBe('attached')
  })

  it('keeps a player who chose role shelves on them', () => {
    expect(keptRosterArrangement('role')).toBe('role')
  })
})
