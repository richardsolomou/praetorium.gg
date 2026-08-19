import { describe, expect, it } from 'vitest'
import { commandSchema } from './commands'

describe('command schema', () => {
  it('accepts a shared setup section', () => {
    expect(commandSchema.parse({ kind: 'set-setup-step', step: 3 })).toEqual({ kind: 'set-setup-step', step: 3 })
  })

  it('rejects a setup section outside the wizard', () => {
    expect(commandSchema.safeParse({ kind: 'set-setup-step', step: 5 }).success).toBe(false)
  })
})
