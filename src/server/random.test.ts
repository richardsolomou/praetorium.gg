import { describe, expect, it } from 'vitest'
import { randomToken } from './random'

describe('random', () => {
  it('creates URL-safe tokens of the requested entropy', () => {
    expect(randomToken(16)).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })

  it('rejects an empty token', () => {
    expect(() => randomToken(0)).toThrow('token bytes must be a positive integer')
  })
})
