import { describe, expect, it } from 'vitest'
import { createBattleSchema, createLeagueSchema, savedRosterDatasheetSchema, submitSchema, updateLeagueSchema } from './schemas'

describe('battle creation input', () => {
  it('keeps the legacy opponent-only payload valid', () => {
    expect(createBattleSchema.parse({ opponentId: 'bob' })).toEqual({
      opponentId: 'bob',
      missionPackId: null,
    })
  })

  it('seats an ally beside the opener, facing one or two opponents', () => {
    expect(createBattleSchema.safeParse({ opponentIds: ['bob'], allyId: 'carol' }).success).toBe(true)
    expect(createBattleSchema.safeParse({ opponentIds: ['bob', 'carol'] }).success).toBe(true)
  })

  it('refuses a fourth chair', () => {
    expect(createBattleSchema.safeParse({ opponentIds: ['bob', 'carol'], allyId: 'dave' }).success).toBe(false)
  })

  it('refuses an ally with nobody to play against', () => {
    expect(createBattleSchema.safeParse({ allyId: 'carol' }).success).toBe(false)
  })
})

describe('battle command input', () => {
  const submission = {
    token: 'battle',
    expectedSeq: 4,
    command: { kind: 'attach-saved-roster', rosterId: 'roster', playerId: 'player' },
  }

  it('accepts a saved roster reference', () => {
    expect(submitSchema.parse(submission)).toEqual(submission)
  })

  it('rejects roster contents beside the saved roster reference', () => {
    expect(submitSchema.safeParse({ ...submission, command: { ...submission.command, picks: [] } }).success).toBe(false)
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

describe('league creation input', () => {
  const league = { name: 'League', visibility: 'public', admission: 'approval' }

  it('allows an optional bounded player limit', () => {
    expect(createLeagueSchema.parse({ ...league, playerLimit: 16 })).toMatchObject({ playerLimit: 16 })
  })

  it('rejects a one-player league', () => {
    expect(createLeagueSchema.safeParse({ ...league, playerLimit: 1 }).success).toBe(false)
  })

  it('requires the league token when editing the same fields', () => {
    expect(updateLeagueSchema.safeParse({ ...league, description: '', playerLimit: null }).success).toBe(false)
    expect(updateLeagueSchema.safeParse({ ...league, token: 'league', description: '', playerLimit: null }).success).toBe(true)
  })

  it('requires an explicit description when editing', () => {
    expect(updateLeagueSchema.safeParse({ ...league, token: 'league', playerLimit: null }).success).toBe(false)
  })

  it('requires an explicit player limit when editing', () => {
    expect(updateLeagueSchema.safeParse({ ...league, token: 'league', description: '' }).success).toBe(false)
  })
})
