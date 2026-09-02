import { describe, expect, it } from 'vitest'
import { shouldOpenOverwatchWindow, stratagemVisibleNow } from './stratagemVisibility'

describe('tracker stratagem visibility', () => {
  it('hides opponent-turn stratagems during your turn', () => {
    expect(stratagemVisibleNow({ name: 'Counter-offensive', turn: 'opponent-turn', phases: ['command'] }, 'command', true, false)).toBe(
      false,
    )
  })

  it('shows opponent-turn stratagems during the opponent turn', () => {
    expect(stratagemVisibleNow({ name: 'Counter-offensive', turn: 'opponent-turn', phases: ['command'] }, 'command', false, false)).toBe(
      true,
    )
  })

  it('does not reveal wrong-turn stratagems when showing other phases', () => {
    expect(stratagemVisibleNow({ name: 'Counter-offensive', turn: 'opponent-turn', phases: ['fight'] }, 'command', true, false, true)).toBe(
      false,
    )
  })

  it('shows Fire Overwatch only after movement is ending', () => {
    const overwatch = { name: 'Fire Overwatch', turn: 'opponent-turn', phases: ['movement'] as const }

    expect(stratagemVisibleNow(overwatch, 'movement', false, false)).toBe(false)
    expect(stratagemVisibleNow(overwatch, 'movement', false, true)).toBe(true)
    expect(stratagemVisibleNow(overwatch, 'shooting', false, true)).toBe(false)
  })

  it('opens the Fire Overwatch window before advancing from movement', () => {
    const stratagems = [{ name: 'Fire Overwatch' }]

    expect(shouldOpenOverwatchWindow(stratagems, 'movement', false)).toBe(true)
    expect(shouldOpenOverwatchWindow(stratagems, 'movement', true)).toBe(false)
    expect(shouldOpenOverwatchWindow(stratagems, 'shooting', false)).toBe(false)
  })
})
