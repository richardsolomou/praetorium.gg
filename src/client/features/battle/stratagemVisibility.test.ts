import { describe, expect, it } from 'vitest'
import { hiddenNow, stratagemVisibleNow } from './stratagemVisibility'

describe('tracker stratagem visibility', () => {
  it('hides opponent-turn stratagems during your turn', () => {
    expect(stratagemVisibleNow({ turn: 'opponent-turn', phases: ['command'] }, 'command', true)).toBe(false)
  })

  it('shows opponent-turn stratagems during the opponent turn', () => {
    expect(stratagemVisibleNow({ turn: 'opponent-turn', phases: ['command'] }, 'command', false)).toBe(true)
  })

  it('hides stratagems for another phase', () => {
    expect(stratagemVisibleNow({ turn: 'either', phases: ['fight'] }, 'command', true)).toBe(false)
  })

  it('reveals your-turn stratagems during the opponent turn when showing all', () => {
    expect(stratagemVisibleNow({ turn: 'your-turn', phases: ['command'] }, 'command', false, true)).toBe(true)
  })

  it('counts stratagems hidden by turn as well as by phase', () => {
    const pool = [
      { turn: 'your-turn', phases: ['shooting' as const] },
      { turn: 'either', phases: ['fight' as const] },
      { turn: 'opponent-turn', phases: ['shooting' as const] },
    ]
    expect(hiddenNow(pool, 'shooting', false)).toBe(2)
  })
})
