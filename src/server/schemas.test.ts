import { describe, expect, it } from 'vitest'
import { REPLAY_BATCH_SIZE } from '../contracts/battles'
import {
  battleReplayBatchSchema,
  createBattleSchema,
  createLeagueBattleSchema,
  createLeagueEventSchema,
  createLeagueSchema,
  leagueBattleOptionsSchema,
  priceSchema,
  datasheetSchema,
  detachmentRulesSchema,
  factionSchema,
  favouriteDetachmentSchema,
  saveRosterSchema,
  savedRosterDatasheetSchema,
  submitSchema,
  terrainReferencesSchema,
  unitsSchema,
  updateLeagueSchema,
} from '../contracts/schemas'

describe('replay batch input', () => {
  it('accepts a full batch', () => {
    expect(
      battleReplayBatchSchema.safeParse({ token: 'battle', seqs: Array.from({ length: REPLAY_BATCH_SIZE }, (_, index) => index + 1) })
        .success,
    ).toBe(true)
  })

  it('rejects an empty batch', () => {
    expect(battleReplayBatchSchema.safeParse({ token: 'battle', seqs: [] }).success).toBe(false)
  })

  it('rejects an oversized batch', () => {
    expect(battleReplayBatchSchema.safeParse({ token: 'battle', seqs: Array(REPLAY_BATCH_SIZE + 1).fill(1) }).success).toBe(false)
  })
})

describe('terrain reference input', () => {
  it('accepts the geometry cache version and keeps older clients valid', () => {
    const legacy = { matchupIds: ['take-vs-purge'] }
    expect(terrainReferencesSchema.parse(legacy)).toEqual(legacy)
    expect(terrainReferencesSchema.parse({ ...legacy, geometryVersion: 2 })).toEqual({ ...legacy, geometryVersion: 2 })
    expect(terrainReferencesSchema.parse({ ...legacy, geometryVersion: 3 })).toEqual({ ...legacy, geometryVersion: 3 })
    expect(terrainReferencesSchema.parse({ ...legacy, geometryVersion: 6 })).toEqual({ ...legacy, geometryVersion: 6 })
    expect(terrainReferencesSchema.parse({ ...legacy, geometryVersion: 7 })).toEqual({ ...legacy, geometryVersion: 7 })
    expect(terrainReferencesSchema.safeParse({ ...legacy, geometryVersion: 8 }).success).toBe(false)
  })
})

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

  it('defaults a new league to a 2,000-point 1v1 its organizer does not play in', () => {
    expect(createLeagueSchema.parse(league)).toMatchObject({ format: '1v1', rosterLimit: 2_000, ownerPlays: false })
  })

  it('rejects a new 2v1 league whose allied half is unsupported', () => {
    expect(createLeagueSchema.safeParse({ ...league, format: '2v1', rosterLimit: 1_000 }).success).toBe(false)
  })

  it('leaves the event rule alone when an update does not name one', () => {
    expect(updateLeagueSchema.parse({ ...league, token: 'league', description: '', playerLimit: null })).not.toHaveProperty('rule')
  })

  it('accepts the supported 2v1 roster-size pair', () => {
    expect(
      createLeagueEventSchema.safeParse({
        ...league,
        token: 'league',
        description: '',
        playerLimit: null,
        format: '2v1',
        rosterLimit: 2_000,
      }).success,
    ).toBe(true)
  })

  it('rejects a 2v1 size whose allied half is unsupported', () => {
    expect(
      createLeagueEventSchema.safeParse({
        ...league,
        token: 'league',
        description: '',
        playerLimit: null,
        format: '2v1',
        rosterLimit: 1_000,
      }).success,
    ).toBe(false)
    expect(
      createLeagueEventSchema.safeParse({ ...league, token: 'league', description: '', playerLimit: null, format: '2v1', rosterLimit: 600 })
        .success,
    ).toBe(false)
  })

  it('accepts the official doubles force size and rejects a smaller one', () => {
    const details = { ...league, token: 'league', description: '', playerLimit: null }
    expect(updateLeagueSchema.safeParse({ ...details, rule: { format: '2v2', rosterLimit: 2_000 } }).success).toBe(true)
    expect(updateLeagueSchema.safeParse({ ...details, rule: { format: '2v2', rosterLimit: 1_000 } }).success).toBe(false)
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

  it('accepts a battle-round stratagem limit in saved prep', () => {
    expect(
      saveRosterSchema.safeParse({
        ...roster,
        name: '',
        prep: {
          stratagems: [{ key: 'titan-killer', name: 'Titan Killer', cp: 1, limit: 'battle-round' }],
          secondaries: [],
        },
      }).success,
    ).toBe(true)
  })

  it('accepts projected detachment ids throughout roster requests', () => {
    const detachmentId = 'profile-detachment-option-470a-6daa-9014-12df-f261-3980-2765-e3be'
    expect([
      saveRosterSchema.safeParse({ ...roster, name: '', detachmentIds: [detachmentId], borrowedDetachmentId: detachmentId }).success,
      priceSchema.safeParse({ ...roster, units: [], detachmentIds: [detachmentId], borrowedDetachmentId: detachmentId }).success,
      datasheetSchema.safeParse({ catalogueId: 'dark-angels', entryId: 'unit', detachmentIds: [detachmentId] }).success,
      favouriteDetachmentSchema.safeParse({ catalogueId: 'dark-angels', detachmentId, favourite: true }).success,
    ]).toEqual([true, true, true, true])
  })

  it('keeps detachment ids bounded', () => {
    expect(priceSchema.safeParse({ ...roster, units: [], detachmentIds: ['a'.repeat(129)] }).success).toBe(false)
  })

  it('saves a list nobody named, since a folded label is what it is called', () => {
    expect(saveRosterSchema.parse({ ...roster, name: '' }).name).toBe('')
  })

  it('keeps a name the player typed, trimmed', () => {
    expect(saveRosterSchema.parse({ ...roster, name: '  Hypercrypt push  ' }).name).toBe('Hypercrypt push')
  })

  it('still refuses a name longer than a list can carry', () => {
    expect(saveRosterSchema.safeParse({ ...roster, name: 'a'.repeat(81) }).success).toBe(false)
  })

  it('keeps ability reminders with their roster', () => {
    const reminder = {
      key: 'datasheet:living-lightning:0',
      ability: 'Living Lightning',
      description: 'In your Shooting phase, select one enemy unit.',
      unit: { index: 0, name: 'Plasmancer' },
      timings: [{ moment: 'phase-start', phase: 'shooting', turn: 'your-turn' }],
    }

    expect(
      saveRosterSchema.parse({
        ...roster,
        name: 'Awakened Dynasty',
        prep: { stratagems: [], secondaries: [], reminders: [reminder], remindersEnabled: false },
      }).prep,
    ).toMatchObject({ reminders: [reminder], remindersEnabled: false })
  })
})

describe('a roster sent with retired Marine codex ids', () => {
  const retired = {
    catalogueId: 'e0af-67df-9d63-8fb8',
    detachmentIds: ['profile-detachment-option-e0af-67df-9d63-8fb8-f367-3240-47c1-7e1a'],
    disposition: null,
    limit: 2_000,
  }
  const current = { catalogueId: 'e0af-67df-9d63-8fb7', detachmentIds: ['d2dc-693e-b491-b16d'] }
  const captain = {
    retired: {
      entryId: 'profile-unit-e0af-67df-9d63-8fb8-024a-3fea-7765-4e82',
      toggles: { 'profile-warlord-e0af-67df-9d63-8fb8-024a-3fea-7765-4e82': 1 },
    },
    current: { entryId: '91e3-a419-8c58-98f5', toggles: { 'a89c-b01e-ffab-8ebb': 1 } },
  }

  it('is priced against current ids, as a stale guest draft or open tab sends it', () => {
    expect(priceSchema.parse({ ...retired, units: [captain.retired] })).toMatchObject({ ...current, units: [captain.current] })
  })

  it('is saved under current ids', () => {
    expect(
      saveRosterSchema.parse({
        ...retired,
        name: '',
        borrowedDetachmentId: retired.detachmentIds[0],
        picks: [captain.retired],
        prep: null,
      }),
    ).toMatchObject({ ...current, borrowedDetachmentId: current.detachmentIds[0], picks: [captain.current] })
  })

  it("reads a battle army's stratagems from its current book", () => {
    expect(detachmentRulesSchema.parse({ catalogueId: retired.catalogueId, detachmentNames: ['Gladius Task Force'] }).catalogueId).toBe(
      current.catalogueId,
    )
  })

  it("names a battle army's current faction", () => {
    expect(factionSchema.parse({ catalogueId: retired.catalogueId }).catalogueId).toBe(current.catalogueId)
  })

  it('opens the current datasheet for a loadout or simulation', () => {
    expect(datasheetSchema.parse({ catalogueId: retired.catalogueId, entryId: captain.retired.entryId })).toMatchObject({
      catalogueId: current.catalogueId,
      entryId: captain.current.entryId,
    })
  })
})
