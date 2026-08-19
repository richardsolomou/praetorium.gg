import { describe, expect, it } from 'vitest'
import { commandSchema } from './commands'

describe('command schema', () => {
  it('accepts a shared setup section', () => {
    expect(commandSchema.parse({ kind: 'set-setup-step', step: 3 })).toEqual({ kind: 'set-setup-step', step: 3 })
  })

  it('rejects a setup section outside the wizard', () => {
    expect(commandSchema.safeParse({ kind: 'set-setup-step', step: 5 }).success).toBe(false)
  })

  it('accepts a player target on a live action', () => {
    expect(commandSchema.parse({ kind: 'advance', playerId: 'alice' })).toEqual({ kind: 'advance', playerId: 'alice' })
  })

  it('accepts settling the previous turn', () => {
    expect(commandSchema.parse({ kind: 'settle-opponent-turn' })).toEqual({ kind: 'settle-opponent-turn' })
  })
})
