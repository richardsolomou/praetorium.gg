import { describe, expect, it } from 'vitest'
import { createBattleSchema, savedRosterDatasheetSchema } from './schemas'

describe('battle creation input', () => {
  it('keeps the legacy opponent-only payload valid', () => {
    expect(createBattleSchema.parse({ opponentId: 'bob' })).toEqual({
      opponentId: 'bob',
      solo: false,
      missionPackId: null,
    })
  })
})

describe('saved roster datasheet input', () => {
  it('accepts a roster id, battle entitlement, and bounded selected pick', () => {
    expect(savedRosterDatasheetSchema.parse({ id: 'roster', battle: 'battle', pickIndex: 16 })).toEqual({
      id: 'roster',
      battle: 'battle',
      pickIndex: 16,
    })
  })

  it('rejects out-of-range pick indexes', () => {
    expect(savedRosterDatasheetSchema.safeParse({ id: 'roster', pickIndex: 100 }).success).toBe(false)
  })
})
