import { describe, expect, it } from 'vitest'
import { rosterPointsChanges } from './rosterPointsMarks'

const mark = { rosterId: 'list', userId: 'owner', updatedAt: 10, points: 1000 }

describe('roster points changes', () => {
  it('names a list whose total moved with the army data alone', () => {
    expect(rosterPointsChanges([{ ...mark, revision: 'old' }], [{ ...mark, points: 1015, name: 'Strike force' }], 'new')).toEqual(
      new Map([['owner', [{ id: 'list', name: 'Strike force', from: 1000, to: 1015 }]]]),
    )
  })

  it('says nothing when the player edited the list, the total held, or this revision already priced it', () => {
    const previous = [{ ...mark, revision: 'old' }]
    expect(rosterPointsChanges(previous, [{ ...mark, updatedAt: 11, points: 1015, name: 'Edited' }], 'new').size).toBe(0)
    expect(rosterPointsChanges(previous, [{ ...mark, name: 'Unchanged' }], 'new').size).toBe(0)
    expect(rosterPointsChanges([{ ...mark, revision: 'new' }], [{ ...mark, points: 1015, name: 'Again' }], 'new').size).toBe(0)
  })
})
