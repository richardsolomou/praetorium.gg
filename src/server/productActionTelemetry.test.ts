import { beforeEach, expect, it, vi } from 'vitest'
import { offlineActionSchemas, type OfflineActionKind } from '../contracts/offlineActions'
import { saveRosterSchema } from '../contracts/schemas'
import { encodeSimulatorState } from '../contracts/simulatorState'
import { leagueRosterFixture } from './leagueRoster.fixtures'
import { offlineActions } from './offlineActions'
import { productActions } from './productActions'
import { offlineContext } from './offlineContext'

const mocks = vi.hoisted(() => ({ capture: vi.fn(), service: {} as Record<string, ReturnType<typeof vi.fn>> }))
const seal = leagueRosterFixture('released')
vi.mock('./app', () => ({
  app: () => ({
    repository: { abilityRemindersByUser: async () => [], ...mocks.service },
    service: {
      ...mocks.service,
      rosterService: mocks.service,
      socialService: mocks.service,
      leagueService: mocks.service,
    },
    telemetry: { capture: mocks.capture },
    catalogueFor: async () => seal.catalogue,
    rulesFor: async () => seal.rules,
  }),
}))

type Case = { kind: OfflineActionKind; input: unknown; result?: unknown; method?: string; events: [string, Record<string, unknown>?][] }
const league = {
  token: 'private-league',
  name: 'Private league',
  description: '',
  visibility: 'private',
  admission: 'approval',
  playerLimit: null,
}
const side = (entryId: string) => ({ catalogueId: 'private-faction', pick: { entryId }, rules: {} })
const matchup = encodeSimulatorState({ v: 1, sides: [side('private-unit'), side('private-target')], swapped: false })
const cases: Case[] = [
  { kind: 'setOwned', input: { entryId: 'private-unit', owned: true }, events: [['player_collection_updated', { owned: true }]] },
  { kind: 'setCollectionModels', input: { entryId: 'private-unit', models: 3 }, events: [['player_collection_counted', { models: 3 }]] },
  {
    kind: 'setCollectionProgress',
    input: { entryId: 'private-unit', built: 2, painted: 1 },
    events: [['player_collection_progressed', { built: 2, painted: 1 }]],
  },
  {
    kind: 'setCollectionCountsAs',
    input: { entryId: 'private-unit', countsAs: ['private-variant'] },
    events: [['player_collection_linked', { datasheets: 1 }]],
  },
  { kind: 'setCollectionWanted', input: { entryId: 'private-unit', wanted: 2 }, events: [['player_collection_wished', { wanted: 2 }]] },
  {
    kind: 'setFavouriteFaction',
    input: { catalogueId: 'private-faction', favourite: true },
    events: [['favourite_faction_updated', { favourite: true }]],
  },
  {
    kind: 'setFavouriteDetachment',
    input: { catalogueId: 'private-faction', detachmentId: 'private-detachment', favourite: true },
    events: [['favourite_detachment_updated', { favourite: true }]],
  },
  {
    kind: 'setFavouriteDatasheet',
    input: { entryId: 'private-unit', favourite: false },
    events: [['favourite_datasheet_updated', { favourite: false }]],
  },
  {
    kind: 'setPlayerDefaults',
    input: { rosterVisibility: 'private', battleSize: 2000 },
    result: { rosterVisibility: 'public', battleSize: 1000 },
    events: [['player_defaults_set', { roster_visibility: 'public', battle_size: 1000 }]],
  },
  {
    kind: 'setPushNotifications',
    method: 'setPushEnabled',
    input: { enabled: true },
    result: false,
    events: [['push_notifications_updated', { enabled: false }]],
  },
  { kind: 'rememberMatchup', input: { shared: matchup, attacker: 'Private unit', defender: 'Private target' }, events: [] },
  { kind: 'forgetMatchup', input: { shared: matchup }, events: [] },
  {
    kind: 'setAbilityReminder',
    input: {
      key: 'datasheet:private',
      ability: 'Private',
      description: '',
      timings: [{ moment: 'turn-start', phase: null, turn: 'your-turn' }],
    },
    events: [['ability_reminder_set', { timings: 1 }]],
  },
  {
    kind: 'removeAbilityReminder',
    method: 'deleteAbilityReminder',
    input: { key: 'datasheet:private' },
    events: [['ability_reminder_removed', {}]],
  },
  { kind: 'updateOnboardingProgress', input: { operation: 'welcome' }, events: [['onboarding_welcomed']] },
  {
    kind: 'updateOnboardingProgress',
    input: { operation: 'complete', task: 'reference' },
    events: [['onboarding_task_completed', { task: 'reference' }]],
  },
  {
    kind: 'updateOnboardingProgress',
    input: { operation: 'skip', task: 'battle' },
    events: [['onboarding_task_skipped', { task: 'battle' }]],
  },
  {
    kind: 'updateOnboardingProgress',
    input: { operation: 'restore', task: 'battle' },
    events: [['onboarding_task_restored', { task: 'battle' }]],
  },
  { kind: 'requestFriend', input: { userId: 'private-person' }, events: [['friend_request_sent']] },
  { kind: 'acceptFriend', input: { userId: 'private-person' }, events: [['friend_request_accepted']] },
  { kind: 'rejectFriend', input: { userId: 'private-person' }, events: [['friend_request_rejected']] },
  { kind: 'removeFriend', input: { userId: 'private-person' }, events: [['friendship_removed']] },
  { kind: 'acceptFriendInvite', input: { token: 'private-invite' }, events: [['friend_invite_accepted']] },
  { kind: 'createFriendInvite', input: {}, result: 'private-invite', events: [['friend_invite_created']] },
  { kind: 'cancelFriendInvite', input: {}, events: [['friend_invite_cancelled']] },
  {
    kind: 'createLeague',
    method: 'createTournament',
    input: { ...league, format: '1v1', rosterLimit: 2000, ownerPlays: true },
    result: { token: 'private-created' },
    events: [['league_created', { visibility: 'private', admission: 'approval', format: '1v1', roster_limit: 2000, owner_plays: true }]],
  },
  { kind: 'joinLeague', input: { token: league.token }, result: 'pending', events: [['league_joined', { status: 'pending' }]] },
  {
    kind: 'addLeagueEntrants',
    input: { token: league.token, userIds: ['private-person'] },
    result: { added: 1 },
    events: [['league_entrants_added', { count: 1 }]],
  },
  {
    kind: 'admitLeagueEntries',
    input: { token: league.token, userIds: ['private-person', 'private-other'] },
    result: { admitted: ['private-person'] },
    events: [['league_entries_admitted', { count: 1 }]],
  },
  {
    kind: 'moderateLeagueEntry',
    input: { token: league.token, userId: 'private-person', status: 'accepted' },
    events: [['league_entry_moderated', { status: 'accepted' }]],
  },
  {
    kind: 'submitLeagueRoster',
    input: {
      token: league.token,
      rosterId: seal.saved.id,
      capturedRoster: saveRosterSchema.parse(seal.saved),
      catalogueRevision: seal.catalogue.index.revision,
    },
    result: { format: '2v2', requiredLimit: 1000 },
    events: [['league_roster_submitted', { format: '2v2', required_limit: 1000 }]],
  },
  { kind: 'setLeagueTeamDisposition', input: { token: league.token, disposition: 'private-disposition' }, events: [] },
  { kind: 'setLeagueTeamWarlord', input: { token: league.token, userId: 'private-person' }, events: [] },
  { kind: 'revealLeague', input: { token: league.token }, events: [['league_rosters_revealed']] },
  { kind: 'unsealLeagueRoster', input: { token: league.token, userId: 'private-person' }, events: [['league_roster_unsealed']] },
  {
    kind: 'assignLeagueRosterRequirement',
    input: { token: league.token, userId: 'private-person', requiredLimit: 1000 },
    result: { requiredLimit: 2000 },
    events: [['league_roster_requirement_assigned', { required_limit: 2000 }]],
  },
  {
    kind: 'assignLeagueTeam',
    input: { token: league.token, userIds: ['private-person'] },
    result: { teamSize: 2 },
    events: [['league_team_assigned', { team_size: 2 }]],
  },
  {
    kind: 'chooseLeagueSide',
    input: { token: league.token, side: 'pair' },
    result: { side: 'pair' },
    events: [['league_side_chosen', { side: 'pair' }]],
  },
  {
    kind: 'updateLeague',
    input: { ...league, rule: { format: '1v1', rosterLimit: 1000 } },
    result: { ruleChanged: true },
    events: [
      ['league_updated', { visibility: 'private', admission: 'approval', player_limit_set: false }],
      ['league_event_updated', { format: '1v1', roster_limit: 1000 }],
    ],
  },
  {
    kind: 'updateLeague',
    input: league,
    result: { ruleChanged: false },
    events: [['league_updated', { visibility: 'private', admission: 'approval', player_limit_set: false }]],
  },
  {
    kind: 'updateLeague',
    input: { token: 'private-game', rule: { format: '1v1', rosterLimit: 1000 } },
    result: { ruleChanged: true },
    events: [['league_event_updated', { format: '1v1', roster_limit: 1000 }]],
  },
  { kind: 'deleteLeague', input: { token: league.token }, events: [['league_deleted']] },
  {
    kind: 'deleteBattle',
    input: { token: 'private-battle' },
    result: 'battle-id',
    events: [['battle_deleted', { battle_id: 'battle-id' }]],
  },
  {
    kind: 'createBattle',
    input: { limit: 2000, opponentId: 'private-opponent' },
    result: { battleId: 'battle-id', token: 'private-battle', practice: false },
    events: [
      [
        'battle_created',
        { battle_id: 'battle-id', limit: 2000, player_count: 2, practice: false, casual: false, manual: false, guests: 0 },
      ],
    ],
  },
  {
    kind: 'createLeagueBattle',
    input: { token: league.token, opponentId: 'private-person' },
    result: { battleId: 'battle-id', token: 'private-battle', format: '1v1', requiredLimit: 2000 },
    events: [['league_battle_created', { battle_id: 'battle-id', format: '1v1', required_limit: 2000 }]],
  },
]

beforeEach(() => {
  vi.resetAllMocks()
  mocks.service = { usableRoster: vi.fn().mockResolvedValue({ roster: seal.saved, lentBy: null }) }
})

it('covers every queued operation', () => {
  expect([...new Set(cases.map(({ kind }) => kind))].sort()).toEqual(Object.keys(offlineActionSchemas).sort())
})

it.each(cases)('keeps the direct $kind event contract consistent', async ({ kind, input, result, method, events }) => {
  mocks.service[method ?? kind] = vi.fn().mockResolvedValue(result)
  await productActions[kind]('actor', input)
  expect(mocks.capture.mock.calls).toEqual(events.map(([event, properties]) => ['actor', event, { ...properties, delivery: 'direct' }]))
})

it.each(cases)('captures newly committed $kind using bounded properties', async ({ kind, input, result, method, events }) => {
  mocks.service[method ?? kind] = vi.fn(async () => {
    offlineContext.getStore()!.applied = true
    return result
  })
  await offlineContext.run(
    { id: crypto.randomUUID(), owner: 'actor', fingerprint: 'fingerprint', createdAt: 100, identifiers: {}, wrote: false },
    () => offlineActions[kind]('actor', input),
  )
  expect(mocks.capture.mock.calls).toEqual(events.map(([event, properties]) => ['actor', event, { ...properties, delivery: 'sync' }]))
})

it.each(cases)('does not recapture concurrent $kind receipts', async ({ kind, input, result, method }) => {
  mocks.service[method ?? kind] = vi.fn(async () => {
    offlineContext.getStore()!.applied = false
    return result
  })
  await offlineContext.run(
    { id: crypto.randomUUID(), owner: 'actor', fingerprint: 'fingerprint', createdAt: 100, identifiers: {}, wrote: false },
    () => offlineActions[kind]('actor', input),
  )
  expect(mocks.capture).not.toHaveBeenCalled()
})

it.each(cases)('does not capture a refused $kind', async ({ kind, input, method }) => {
  mocks.service[method ?? kind] = vi.fn().mockRejectedValue(new Error('write refused'))
  await offlineContext
    .run({ id: crypto.randomUUID(), owner: 'actor', fingerprint: 'fingerprint', createdAt: 100, identifiers: {}, wrote: false }, () =>
      offlineActions[kind]('actor', input),
    )
    .catch(() => {})
  expect(mocks.capture).not.toHaveBeenCalled()
})
