import { describe, expect, it } from 'vitest'
import { stratagemVisibleNow } from './stratagemVisibility'

describe('tracker stratagem visibility', () => {
  it('hides opponent-turn stratagems during your turn', () => {
    expect(stratagemVisibleNow({ turn: 'opponent-turn', phases: ['command'] }, 'command', true)).toBe(false)
  })

  it('shows opponent-turn stratagems during the opponent turn', () => {
    expect(stratagemVisibleNow({ turn: 'opponent-turn', phases: ['command'] }, 'command', false)).toBe(true)
  })

  it('does not reveal wrong-turn stratagems when showing other phases', () => {
    expect(stratagemVisibleNow({ turn: 'opponent-turn', phases: ['fight'] }, 'command', true, true)).toBe(false)
  })
})
