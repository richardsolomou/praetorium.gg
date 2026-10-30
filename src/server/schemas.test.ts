import { describe, expect, it } from 'vitest'
import { REPLAY_BATCH_SIZE } from '../contracts/battles'
import { TERRAIN_GEOMETRY_VERSION } from '../contracts/terrainReference'
import { PROFILE_NAME_MAX_LENGTH } from '../core/profileName'
import {
  battleReplayBatchSchema,
  createBattleSchema,
  createSealedEventBattleSchema,
  createHiddenListGameSchema,
  createSealedEventSchema,
  sealedEventBattleOptionsSchema,
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
  updateSealedEventSchema,
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
  it('accepts the geometry cache version the client sends and keeps unversioned clients valid', () => {
    const legacy = { matchupIds: ['take-vs-purge'] }
    expect(
      [undefined, TERRAIN_GEOMETRY_VERSION, TERRAIN_GEOMETRY_VERSION + 1].map(
        (geometryVersion) => terrainReferencesSchema.safeParse({ ...legacy, geometryVersion }).success,
      ),
    ).toEqual([true, true, false])
  })
})

describe('battle creation input', () => {
  it('keeps the legacy opponent-only payload valid', () => {
    expect(createBattleSchema.parse({ opponentId: 'bob' })).toEqual({
      opponentId: 'bob',
      missionPackId: null,
      casual: false,
      manual: false,
    })
  })

  it('requires an explicit casual confirmation to bypass a sealed event match', () => {
    expect(createBattleSchema.parse({ opponentId: 'bob', casual: true }).casual).toBe(true)
    expect(sealedEventBattleOptionsSchema.parse({ opponentIds: ['bob', 'carol'], allyId: 'dave' })).toEqual({
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

  it('seats a guest opponent by name', () => {
    expect(createBattleSchema.parse({ guestNames: [' Alex '] }).guestNames).toEqual(['Alex'])
  })

  it('refuses a guest without a name', () => {
    expect(createBattleSchema.safeParse({ guestNames: ['  '] }).success).toBe(false)
  })

  it('refuses a guest name longer than a display name', () => {
    expect(createBattleSchema.safeParse({ guestNames: ['x'.repeat(PROFILE_NAME_MAX_LENGTH + 1)] }).success).toBe(false)
  })

  it('counts guests among the opposing seats', () => {
    expect(createBattleSchema.safeParse({ opponentIds: ['bob', 'carol'], guestNames: ['Alex'] }).success).toBe(false)
  })

  it('lets an ally face a guest', () => {
    expect(createBattleSchema.safeParse({ allyId: 'carol', guestNames: ['Alex'] }).success).toBe(true)
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

describe('sealedEvent creation input', () => {
  const sealedEvent = { name: 'Autumn tournament', visibility: 'public', admission: 'approval' }

  it('allows an optional bounded player limit', () => {
    expect(createSealedEventSchema.parse({ ...sealedEvent, playerLimit: 16 })).toMatchObject({ playerLimit: 16 })
  })

  it('defaults a new sealed event to a 2,000-point 1v1 its organizer does not play in', () => {
    expect(createSealedEventSchema.parse(sealedEvent)).toMatchObject({ format: '1v1', rosterLimit: 2_000, ownerPlays: false })
  })

  it('rejects a new 2v1 sealed event at King of the Colosseum', () => {
    expect(createSealedEventSchema.safeParse({ ...sealedEvent, format: '2v1', rosterLimit: 600 }).success).toBe(false)
  })

  it('leaves the event rule alone when an update does not name one', () => {
    expect(updateSealedEventSchema.parse({ ...sealedEvent, token: 'league', description: '', playerLimit: null })).not.toHaveProperty(
      'rule',
    )
  })

  it('accepts the supported 2v1 roster-size pair', () => {
    expect(createSealedEventSchema.safeParse({ ...sealedEvent, format: '2v1', rosterLimit: 2_000 }).success).toBe(true)
  })

  it('refuses an update carrying only some of a tournament’s details', () => {
    expect(updateSealedEventSchema.safeParse({ token: 'league', name: 'Autumn tournament' }).success).toBe(false)
  })

  it('refuses Swiss rounds for a group’s hidden-list game', () => {
    expect(createHiddenListGameSchema.safeParse({ groupToken: 'group', rounds: 3 }).success).toBe(false)
  })

  it('refuses a solo player’s points at a doubles event', () => {
    const details = { ...sealedEvent, token: 'league', description: '', playerLimit: null }
    expect(updateSealedEventSchema.safeParse({ ...details, rule: { format: '2v2', rosterLimit: 2_000, soloPoints: 1_000 } }).success).toBe(
      false,
    )
  })

  it('accepts all four doubles seats', () => {
    expect(
      createSealedEventBattleSchema.safeParse({
        token: 'league',
        opponentId: 'solo',
        allyId: 'ally',
        secondOpponentId: 'other-ally',
      }).success,
    ).toBe(true)
  })

  it('rejects a one-player sealed event', () => {
    expect(createSealedEventSchema.safeParse({ ...sealedEvent, playerLimit: 1 }).success).toBe(false)
  })

  it('requires the sealed event token when editing the same fields', () => {
    expect(updateSealedEventSchema.safeParse({ ...sealedEvent, description: '', playerLimit: null }).success).toBe(false)
    expect(updateSealedEventSchema.safeParse({ ...sealedEvent, token: 'league', description: '', playerLimit: null }).success).toBe(true)
  })

  it('requires an explicit description when editing', () => {
    expect(updateSealedEventSchema.safeParse({ ...sealedEvent, token: 'league', playerLimit: null }).success).toBe(false)
  })

  it('requires an explicit player limit when editing', () => {
    expect(updateSealedEventSchema.safeParse({ ...sealedEvent, token: 'league', description: '' }).success).toBe(false)
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

describe('catalogue loadout migrations at request boundaries', () => {
  const pick = {
    entryId: '8b71-580f-ad19-83d7',
    choices: { '692c-f7be-75d4-ba2d/f1f6-718e-222f-9ed5': 'b440-75d0-9e95-486a' },
  }
  const roster = { catalogueId: 'f89b-84e0-6e3b-f1e2', detachmentIds: [], disposition: null, limit: 2_000 }

  it('migrates current loadouts before pricing and saving', () => {
    const expected = {
      ...pick,
      choices: { '266c-3f4c-4aed-9472/8d7b-3dfe-7b91-2490/692c-f7be-75d4-ba2d/f1f6-718e-222f-9ed5': 'b440-75d0-9e95-486a' },
    }
    expect([
      priceSchema.parse({ ...roster, units: [pick] }).units,
      saveRosterSchema.parse({ ...roster, name: '', picks: [pick], prep: null }).picks,
      datasheetSchema.parse({ ...roster, entryId: pick.entryId, picks: [pick] }).picks,
    ]).toEqual([[expected], [expected], [expected]])
  })

  it('preserves retained edition loadouts before pricing, saving, and opening a datasheet', () => {
    const retained = { ...roster, catalogueId: `previous~${roster.catalogueId}` }
    expect([
      priceSchema.parse({ ...retained, units: [pick] }).units,
      saveRosterSchema.parse({ ...retained, name: '', picks: [pick], prep: null }).picks,
      datasheetSchema.parse({ ...retained, entryId: pick.entryId, picks: [pick] }).picks,
    ]).toEqual([[pick], [pick], [pick]])
  })
})

it('retains original rules consistently when a roster is priced, saved, or opened', () => {
  const roster = {
    catalogueId: 'a603-5039-f08d-e841',
    detachmentIds: ['profile-detachment-option-a603-5039-f08d-e841-f367-3240-47c1-7e1a'],
    disposition: null,
    limit: 2000,
  }
  const pick = { entryId: 'profile-unit-a603-5039-f08d-e841-5302-e1f9-0338-76f9' }
  expect([
    priceSchema.parse({ ...roster, units: [pick] }).catalogueId,
    saveRosterSchema.parse({ ...roster, name: '', picks: [pick], prep: null }).catalogueId,
    datasheetSchema.parse({ ...roster, entryId: pick.entryId, picks: [pick] }).catalogueId,
  ]).toEqual(Array(3).fill('legacy-profiles~a603-5039-f08d-e841'))
})
