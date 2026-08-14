import { describe, expect, it } from 'vitest'
import { createBattleSchema } from './schemas'

describe('battle creation input', () => {
  it('keeps the legacy opponent-only payload valid', () => {
    expect(createBattleSchema.parse({ opponentId: 'bob' })).toEqual({
      opponentId: 'bob',
      solo: false,
      missionPackId: null,
      clockLimitMinutes: null,
    })
  })
})
