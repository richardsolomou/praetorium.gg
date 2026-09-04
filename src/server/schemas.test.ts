import { describe, expect, it } from 'vitest'
import {
  createBattleSchema,
  createLeagueBattleSchema,
  createLeagueEventSchema,
  createLeagueSchema,
  leagueBattleOptionsSchema,
  saveRosterSchema,
  savedRosterDatasheetSchema,
  submitSchema,
  unitsSchema,
  updateLeagueSchema,
} from './schemas'

describe('battle creation input', () => {
  it('keeps the legacy opponent-only payload valid', () => {
    expect(createBattleSchema.parse({ opponentId: 'bob' })).toEqual({
      opponentId: 'bob',
      missionPackId: null,
      casual: false,
    })
  })

  it('requires an explicit casual confirmation to bypass a league match', () => {
    expect(createBattleSchema.parse({ opponentId: 'bob', casual: true }).casual).toBe(true)
    expect(leagueBattleOptionsSchema.parse({ opponentIds: ['bob', 'carol'], allyId: 'dave' })).toEqual({
      opponentIds: ['bob', 'carol'],
      allyId: 'dave',
    })
  })

  it('seats an ally beside the opener, facing one or two opponents', () => {
    expect(createBattleSchema.safeParse({ opponentIds: ['bob'], allyId: 'carol' }).success).toBe(true)
    expect(createBattleSchema.safeParse({ opponentIds: ['bob', 'carol'] }).success).toBe(true)
  })

  it('accepts doubles and refuses a fifth chair', () => {
    expect(createBattleSchema.safeParse({ opponentIds: ['bob', 'carol'], allyId: 'dave' }).success).toBe(true)
    expect(createBattleSchema.safeParse({ opponentIds: ['bob', 'carol', 'dave'], allyId: 'erin' }).success).toBe(false)
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

describe('unit picker input', () => {
  it('accepts the retired Colosseum size used by saved rosters', () => {
    expect(unitsSchema.safeParse({ catalogueId: 'necrons', battleSize: 500 }).success).toBe(true)
  })

  it('rejects an unknown battle size', () => {
    expect(unitsSchema.safeParse({ catalogueId: 'necrons', battleSize: 501 }).success).toBe(false)
  })
})

describe('league creation input', () => {
  const league = { name: 'League', visibility: 'public', admission: 'approval' }

  it('allows an optional bounded player limit', () => {
    expect(createLeagueSchema.parse({ ...league, playerLimit: 16 })).toMatchObject({ playerLimit: 16 })
  })

  it('defaults an older create payload to a 2,000-point 1v1 event', () => {
    expect(createLeagueSchema.parse(league)).toMatchObject({ format: '1v1', rosterLimit: 2_000, recurring: true })
  })

  it('accepts the supported 2v1 roster-size pair', () => {
    expect(createLeagueEventSchema.safeParse({ token: 'league', format: '2v1', rosterLimit: 2_000 }).success).toBe(true)
  })

  it('rejects a 2v1 size whose allied half is unsupported', () => {
    expect(createLeagueSchema.safeParse({ ...league, format: '2v1', rosterLimit: 1_000 }).success).toBe(false)
    expect(createLeagueSchema.safeParse({ ...league, format: '2v1', rosterLimit: 600 }).success).toBe(false)
  })

  it('rejects a fixed two-player 2v1 event', () => {
    expect(createLeagueSchema.safeParse({ ...league, format: '2v1', rosterLimit: 2_000, playerLimit: 2 }).success).toBe(false)
  })

  it('accepts official doubles and rejects odd or undersized fixed limits', () => {
    expect(createLeagueSchema.safeParse({ ...league, format: '2v2', rosterLimit: 2_000, playerLimit: 4 }).success).toBe(true)
    expect(createLeagueSchema.safeParse({ ...league, format: '2v2', rosterLimit: 2_000, playerLimit: 3 }).success).toBe(false)
    expect(createLeagueSchema.safeParse({ ...league, format: '2v2', rosterLimit: 2_000, playerLimit: 5 }).success).toBe(false)
  })

  it('accepts all four doubles seats', () => {
    expect(
      createLeagueBattleSchema.safeParse({
        token: 'league',
        opponentId: 'solo',
        allyId: 'ally',
        secondOpponentId: 'other-ally',
      }).success,
    ).toBe(true)
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

describe('saved roster input', () => {
  const roster = {
    catalogueId: 'necrons',
    detachmentIds: ['hypercrypt'],
    disposition: null,
    limit: 1_000,
    picks: [],
    prep: null,
  }

  it('saves a list nobody named, since a folded label is what it is called', () => {
    expect(saveRosterSchema.parse({ ...roster, name: '' }).name).toBe('')
  })

  it('keeps a name the player typed, trimmed', () => {
    expect(saveRosterSchema.parse({ ...roster, name: '  Hypercrypt push  ' }).name).toBe('Hypercrypt push')
  })

  it('still refuses a name longer than a list can carry', () => {
    expect(saveRosterSchema.safeParse({ ...roster, name: 'a'.repeat(81) }).success).toBe(false)
  })
})
