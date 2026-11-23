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
      { turn: 'your-turn' as const, phases: ['shooting' as const] },
      { turn: 'either' as const, phases: ['fight' as const] },
      { turn: 'opponent-turn' as const, phases: ['shooting' as const] },
    ]
    expect(hiddenNow(pool, 'shooting', false)).toBe(2)
  })

  it('shows a stratagem only in the turn its window names for this phase', () => {
    const windows = [
      { phase: 'shooting' as const, turn: 'opponent-turn' as const },
      { phase: 'fight' as const, turn: 'either' as const },
    ]
    const shown = (phase: 'shooting' | 'fight', ownTurn: boolean) => stratagemVisibleNow({ turn: 'either', windows }, phase, ownTurn)
    expect([shown('shooting', true), shown('shooting', false), shown('fight', true)]).toEqual([false, true, true])
  })
})
