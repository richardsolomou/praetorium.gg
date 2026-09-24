import { describe, expect, it } from 'vitest'
import { automaticAttemptsExhausted, claimAutomaticAttempt } from './automaticAttempts'

describe('automatic command attempts', () => {
  it('stops after three attempts at the same state', () => {
    const attempts = new Map<string, number>()

    expect([1, 2, 3, 4].map(() => claimAutomaticAttempt(attempts, 'state'))).toEqual([true, true, true, false])
    expect(automaticAttemptsExhausted(attempts, 'state')).toBe(true)
  })

  it('allows attempts again when the state changes', () => {
    const attempts = new Map([['old', 3]])

    expect(claimAutomaticAttempt(attempts, 'new')).toBe(true)
  })
})
