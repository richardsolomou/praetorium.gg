import { callSpacetime, spacetimeDatabaseUrl, type SpacetimeConnection } from 'ras-stack/spacetime'
import { offlineContext, SYNC_PRODUCT_ACTIONS } from './offlineContext'
import { z } from 'zod'
import { collectionProfileSchema } from '../contracts/collection'
import type { CollectionImportRow } from '../core/collection'
import { ROSTER_SOURCES, ROSTER_VISIBILITIES, type RosterSource, type RosterVisibility } from '../core/savedRoster'
import { commandRefusal, reduceBattle, type Command, type LoggedCommand, type Refusal, type SubmitResult } from '../core/battle'
import { commandSchema } from '../core/commands'
import { BATTLE_AUDIENCES, DEFAULT_BATTLE_AUDIENCE, type BattleAudience } from '../core/battleAudience'
import { ROSTER_LIBRARY_BATCH_SIZE } from '../core/rosterLibrary'
import { ROSTER_DISCOVERY_MAX_PAGE_SIZE, rosterDiscoveryCursorSchema, type RosterDiscoveryQuery } from '../core/rosterDiscovery'
import type { PlayerDefaults } from '../core/playerDefaults'
import { playerDefaultsSchema } from '../contracts/schemas'
import { recentMatchupSchema, type RecentMatchup } from '../core/recentMatchups'
import { onboardingProgress as foldOnboardingProgress, type OnboardingProgressOperation } from '../core/onboarding'
import { TABLE_SHAPES } from '../core/tableShape'
import { unitLoadoutPickSchema, type UnitLoadout } from '../core/unitLoadouts'
import { leagueRosterSharingSchema } from '../contracts/leagueRosterSharing'

// Module results drop fields this build does not know, so a replica still on the previous build keeps
// reading after a newer module appends a column or result field.
const rosterRow = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  automaticName: z.boolean(),
  catalogueId: z.string(),
  detachmentId: z.string().nullable(),
  disposition: z.string().nullable(),
  limit: z.number().int(),
  pointsBudget: z.number().int().nullable(),
  picks: z.string(),
  prep: z.string().nullable(),
  tags: z.string(),
  waivedRules: z.string(),
  optionalRules: z.string(),
  borrowedDetachmentId: z.string().nullable(),
  baseRosterId: z.string().nullable(),
  locked: z.boolean(),
  // Rows saved before archiving existed hold no value, which reads as active.
  archived: z
    .boolean()
    .nullish()
    .transform((archived) => archived === true),
  copiedFromRosterId: z.string().nullable(),
  visibility: z.enum(ROSTER_VISIBILITIES),
  source: z.enum(ROSTER_SOURCES),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})

const rosterSummaryRow = rosterRow.omit({ userId: true, picks: true, prep: true, tags: true, copiedFromRosterId: true }).extend({
  unitCount: z.number().int().nonnegative(),
})
const lentRosterRow = rosterSummaryRow.extend({ ownerId: z.string(), lentAt: z.number().int(), picks: z.string() })
const collectionRow = z.object({
  userId: z.string(),
  entryId: z.string(),
  at: z.number().int(),
  models: z.number().int(),
  built: z.number().int().default(0),
  painted: z.number().int().default(0),
  photoIds: z.array(z.uuid()).optional(),
})
const recentMatchupRow = recentMatchupSchema.extend({ at: z.number().int() })
const favouriteDatasheetRow = z.object({ userId: z.string(), entryId: z.string(), at: z.number().int() })
const favouriteFactionRow = z.object({ userId: z.string(), catalogueId: z.string(), at: z.number().int() })
const favouriteDetachmentRow = z.object({
  userId: z.string(),
  catalogueId: z.string(),
  detachmentId: z.string(),
  at: z.number().int(),
})
const unitLoadoutRow = z.object({
  id: z.string(),
  name: z.string(),
  catalogueId: z.string(),
  pick: unitLoadoutPickSchema,
  createdAt: z.number().int(),
})
const pushTarget = z.object({ userId: z.string(), token: z.string() })
const battleSnapshot = z.object({
  battle: z.object({ id: z.string(), token: z.string(), createdAt: z.number().int() }),
  seats: z.array(z.object({ id: z.string(), side: z.number().int(), automated: z.boolean(), guestName: z.string().optional() })),
  log: z.array(
    z.object({
      seq: z.number().int(),
      by: z.string(),
      at: z.number().int(),
      command: commandSchema,
      operationId: z.uuid().optional(),
    }),
  ),
})
const guestInvitation = z.object({
  battleId: z.string(),
  token: z.string(),
  seatId: z.string(),
  guestName: z.string(),
  hostId: z.string().nullable(),
  joined: z.boolean(),
})
const joinedGuest = z.object({ battleId: z.string(), token: z.string(), seatId: z.string() })
const battleFeedResult = z.object({
  battles: z.array(z.object({ ...battleSnapshot.shape, at: z.number().int() })),
  nextCursor: z.object({ at: z.number().int(), id: z.string() }).nullable(),
})
const submission = z.object({
  applied: z.boolean().optional(),
  result: z.discriminatedUnion('outcome', [
    z.object({ outcome: z.literal('stale'), seq: z.number().int() }),
    z.object({ outcome: z.literal('refused'), reason: z.string() }),
    z.object({ outcome: z.literal('appended'), seq: z.number().int() }),
  ]),
  log: battleSnapshot.shape.log,
})
const friendship = z.object({ requesterId: z.string(), addresseeId: z.string(), acceptedAt: z.number().int().nullable() })
const productStat = z.object({
  userId: z.string(),
  rosterCount: z.number().int().nonnegative(),
  battleCount: z.number().int().nonnegative(),
  leagueCount: z.number().int().nonnegative(),
  friendCount: z.number().int().nonnegative(),
  practiceOpponent: z.boolean(),
})
const invite = z.object({ token: z.string(), inviterId: z.string() })
const acceptedInvite = z.union([z.enum(['missing', 'self', 'already-friends']), z.object({ inviterId: z.string() })])
const onboarding = z.object({
  welcomed: z.boolean(),
  tasks: z.array(z.object({ task: z.string(), state: z.enum(['completed', 'skipped']) })),
  facts: z.object({ roster: z.boolean(), friend: z.boolean(), battle: z.boolean(), league: z.boolean() }),
})

const league = z.object({
  id: z.string(),
  token: z.string(),
  ownerId: z.string(),
  name: z.string(),
  description: z.string(),
  visibility: z.enum(['public', 'private']),
  admission: z.enum(['automatic', 'approval']),
  playerLimit: z.number().int().nullable(),
  recurring: z.boolean(),
  createdAt: z.number().int(),
})
const leagueEvent = z.object({
  id: z.string(),
  token: z.string(),
  leagueId: z.string(),
  number: z.number().int(),
  format: z.enum(TABLE_SHAPES).nullable(),
  rosterLimit: z.number().int().nullable(),
  createdAt: z.number().int(),
  revealedAt: z.number().int().nullable(),
  revealedBy: z.string().nullable(),
})
const leagueEntry = z.object({
  key: z.string(),
  eventId: z.string(),
  userId: z.string(),
  status: z.enum(['pending', 'accepted', 'rejected']),
  joinedAt: z.number().int(),
  rosterId: z.string().nullable(),
  rosterName: z.string().nullable(),
  rosterSnapshot: z.string().nullable(),
  submittedAt: z.number().int().nullable(),
  requiredLimit: z.number().int().nullable(),
  teamId: z.string().nullable(),
})
const leagueRecord = z.object({
  league,
  selected: leagueEvent,
  latest: leagueEvent,
  events: z.array(leagueEvent),
  eventCount: z.number().int(),
  entries: z.array(leagueEntry),
  teams: z.array(z.object({ teamId: z.string(), disposition: z.string() })),
  adminIds: z.array(z.string()),
  latestEntryCount: z.number().int(),
  latestAcceptedCount: z.number().int(),
})
const visibleLeague = z.object({
  league,
  event: leagueEvent,
  personal: z.boolean(),
  adminIds: z.array(z.string()),
  joined: z.number().int(),
  accepted: z.number().int(),
  occupied: z.number().int(),
  ownEntry: leagueEntry.nullable(),
})
const leagueCandidate = z.object({ league, event: leagueEvent, entries: z.array(leagueEntry) })
const leagueRoster = z.object({ event: leagueEvent, entry: leagueEntry, reader: leagueEntry.nullable() })
const friendLeagueRoster = z.object({
  leagueToken: z.string(),
  leagueName: z.string(),
  eventToken: z.string(),
  eventNumber: z.number().int(),
  eventCount: z.number().int(),
  userId: z.string(),
  rosterName: z.string(),
  catalogueId: z.string(),
  revealedAt: z.number(),
})
const outdatedLeagueEntry = z.object({
  leagueToken: z.string(),
  leagueName: z.string(),
  eventToken: z.string(),
  eventNumber: z.number().int(),
})

type SaveRosterInput = {
  id: string
  userId: string
  name: string
  automaticName?: boolean
  catalogueId: string
  detachmentId: string | null
  disposition: string | null
  limit: number
  /** Omitted by a client that predates custom budgets, which keeps the stored budget. */
  pointsBudget?: number | null
  picks: string
  prep: string | null
  tags: string
  waivedRules: string
  optionalRules?: string
  borrowedDetachmentId?: string | null
  baseRosterId?: string | null
  copiedFromRosterId?: string | null
  visibility: RosterVisibility
  source: RosterSource
  now: number
}

export class SpacetimeOperator {
  private readonly connection: SpacetimeConnection

  constructor(
    url: string,
    database: string,
    token: string,
    request: typeof fetch = fetch,
    access?: { clientId: string; clientSecret: string },
    internalHost?: string,
  ) {
    this.connection = {
      url,
      database,
      token,
      fetch: request,
      ...(access ? { headers: { 'CF-Access-Client-Id': access.clientId, 'CF-Access-Client-Secret': access.clientSecret } } : {}),
      ...(internalHost ? { internalHost } : {}),
    }
    spacetimeDatabaseUrl(this.connection)
    if (!token) throw new Error('SpacetimeDB operator token is required')
  }

  async revokeSession(sessionId: string) {
    if (!sessionId || sessionId.length > 128) throw new Error('Invalid session ID')
    await this.call('revoke_session', [sessionId])
  }

  async health() {
    return this.reply('operator_health', [], z.literal(true))
  }

  async deleteUserData(userId: string) {
    if (!userId || userId.length > 128) throw new Error('Invalid user ID')
    await this.call('delete_user_data', [userId])
  }

  async battleForOperator(battleId: string) {
    return this.read('battle_for_operator', [battleId], battleSnapshot)
  }

  async publicStandingsRevision() {
    return this.reply('public_standings_revision', [], z.string().regex(/^[0-9]+$/))
  }

  async createBattle(input: {
    id: string
    token: string
    userId: string
    allyIds?: string[]
    opponentIds?: string[]
    guestNames?: string[]
    initialCommand?: Command
    initialCommands?: Command[]
    now: number
  }) {
    return this.read(
      'create_battle',
      [
        JSON.stringify({
          id: input.id,
          token: input.token,
          userId: input.userId,
          allyIds: input.allyIds ?? [],
          opponentIds: input.opponentIds ?? [],
          guestNames: input.guestNames ?? [],
          initialCommands: input.initialCommands ?? (input.initialCommand ? [input.initialCommand] : []),
          now: input.now,
        }),
      ],
      battleSnapshot,
    )
  }

  async battleByToken(token: string) {
    return (await this.read('battle_by_token', [token], battleSnapshot.nullable())) ?? undefined
  }

  async guestInvite(battleId: string, seatId: string, link: string) {
    return this.read('guest_invite', [battleId, seatId, link], z.string())
  }

  async replaceGuestInvite(battleId: string, seatId: string, link: string) {
    return this.read('replace_guest_invite', [battleId, seatId, link], z.string())
  }

  async guestSeatByInvite(link: string) {
    return this.read('guest_seat_by_invite', [link], guestInvitation.nullable())
  }

  async joinGuestSeat(link: string, deviceHash: string, now: number) {
    return this.read('join_guest_seat', [link, deviceHash, now], z.union([z.enum(['missing', 'taken']), joinedGuest]))
  }

  async guestDevice(seatId: string) {
    return this.read(
      'guest_device',
      [seatId],
      z.object({ battleId: z.string(), token: z.string(), deviceHash: z.string(), joinedAt: z.number().int() }).nullable(),
    )
  }

  async claimGuestSeat(input: { battleId: string; seatId: string; userId: string; deviceHash: string; now: number }) {
    return this.read('claim_guest_seat', [input.battleId, input.seatId, input.userId, input.deviceHash, input.now], z.string())
  }

  async battleFeed(input: {
    scope: 'user' | 'league' | 'public' | 'friends' | 'watchable' | 'profile'
    userId?: string | null
    viewerId?: string | null
    withUserId?: string | null
    leagueToken?: string | null
    eventToken?: string | null
    since?: number | null
    before?: { at: number; id: string } | null
    limit: number
  }) {
    return this.read(
      'battle_feed',
      [
        JSON.stringify({
          scope: input.scope,
          userId: input.userId ?? null,
          viewerId: input.viewerId ?? null,
          withUserId: input.withUserId ?? null,
          leagueToken: input.leagueToken ?? null,
          eventToken: input.eventToken ?? null,
          since: input.since ?? null,
          before: input.before ?? null,
          limit: input.limit,
        }),
      ],
      battleFeedResult,
    )
  }

  async deleteBattle(battleId: string, userId: string) {
    return this.reply('remove_battle', [battleId, userId], z.boolean())
  }

  /** Any battle, whoever opened it; the creator check in `deleteBattle` is the player's rule, not an administrator's. */
  async deleteBattleForOperator(battleId: string) {
    return this.reply('delete_battle_for_operator', [battleId], z.boolean())
  }

  async log(battleId: string) {
    return (await this.battleForOperator(battleId)).log
  }

  async submit(
    input: {
      battleId: string
      userId: string
      expectedSeq: number
      command: Command
      now: number
      operationId?: string
      fingerprint?: string
      recordedAt?: number
      /** The battle as the caller already read it; the product database still checks the sequence when it appends. */
      snapshot?: Pick<z.infer<typeof battleSnapshot>, 'seats' | 'log'>
    },
    validateState?: (state: ReturnType<typeof reduceBattle>) => Refusal | null,
    resolveCommand: (state: ReturnType<typeof reduceBattle>, command: Command) => Command = (_, command) => command,
  ): Promise<{ result: SubmitResult; log: LoggedCommand[]; applied?: boolean }> {
    const snapshot = input.snapshot ?? (await this.battleForOperator(input.battleId))
    const fold = (log: LoggedCommand[]) =>
      reduceBattle(
        snapshot.seats.map((seat) => seat.id),
        log,
        snapshot.seats.map((seat) => seat.side),
        snapshot.seats.filter((seat) => seat.automated).map((seat) => seat.id),
      )
    const state = fold(snapshot.log)
    const command = state.seq === input.expectedSeq ? commandSchema.parse(resolveCommand(state, input.command)) : input.command
    const externalRefusal = state.seq === input.expectedSeq ? (validateState?.(state) ?? null) : null
    const { result, log, applied } = await this.read(
      'submit_battle',
      [
        input.battleId,
        input.userId,
        input.expectedSeq,
        JSON.stringify({
          ...command,
          ...(input.operationId
            ? { $sync: { operationId: input.operationId, fingerprint: input.fingerprint, at: input.recordedAt, reportApplied: true } }
            : {}),
        }),
        input.now,
        externalRefusal?.message ?? '',
      ],
      submission,
    )
    const application = applied === undefined ? {} : { applied }
    if (result.outcome !== 'refused') return { result, log, ...application }
    // The product database answers with a message only, so the code is read from the
    // same rules over the log it refused against, before the resolver touched any state.
    const code = commandRefusal(fold(log), input.userId, command)?.code ?? externalRefusal?.code ?? 'unclassified'
    return { result: { ...result, code }, log, ...application }
  }

  async friendshipsByUser(userId: string) {
    return this.read('friendships_by_user', [userId], z.array(friendship))
  }

  async productStats(userIds: readonly string[]) {
    if (!userIds.length) return new Map<string, z.infer<typeof productStat>>()
    const rows = await this.read('product_stats', [[...new Set(userIds)]], z.array(productStat))
    return new Map(rows.map((row) => [row.userId, row]))
  }

  async practiceOpponentIds() {
    return this.read('practice_opponent_ids', [], z.array(z.string()))
  }

  async registerPracticeOpponent(userId: string) {
    await this.call('register_practice_opponent', [userId])
  }

  async requestFriend(requesterId: string, addresseeId: string, now: number) {
    return this.reply('request_friend', [requesterId, addresseeId, now], z.boolean())
  }

  async acceptFriend(requesterId: string, addresseeId: string, now: number) {
    return this.reply('accept_friend', [requesterId, addresseeId, now], z.boolean())
  }

  async rejectFriend(requesterId: string, addresseeId: string) {
    return this.reply('reject_friend', [requesterId, addresseeId], z.boolean())
  }

  async removeFriend(leftId: string, rightId: string) {
    return this.reply('remove_friend', [leftId, rightId], z.boolean())
  }

  async friendInviteByInviter(inviterId: string) {
    return this.read('friend_invite_by_inviter', [inviterId], z.string().nullable())
  }

  async friendInviteByToken(token: string) {
    return this.read('friend_invite_by_token', [token], invite.nullable())
  }

  async replaceFriendInvite(inviterId: string, token: string, now: number) {
    await this.call('replace_friend_invite', [inviterId, token, now])
  }

  async cancelFriendInvite(inviterId: string) {
    return this.reply('cancel_friend_invite', [inviterId], z.boolean())
  }

  async acceptFriendInvite(token: string, recipientId: string, now: number) {
    return this.read('accept_friend_invite', [token, recipientId, now], acceptedInvite)
  }

  async battleAudiences(userIds: readonly string[]) {
    if (!userIds.length) return new Map<string, BattleAudience>()
    const rows = await this.read(
      'battle_audiences',
      [[...new Set(userIds)]],
      z.array(z.object({ userId: z.string(), audience: z.enum(BATTLE_AUDIENCES) })),
    )
    return new Map(rows.map((row) => [row.userId, row.audience]))
  }

  async battleAudience(userId: string): Promise<BattleAudience> {
    return (await this.battleAudiences([userId])).get(userId) ?? DEFAULT_BATTLE_AUDIENCE
  }

  async setBattleAudience(userId: string, audience: BattleAudience, now: number) {
    return this.reply('set_battle_audience', [userId, audience, now], z.enum(BATTLE_AUDIENCES))
  }

  async shareBattle(userId: string, otherId: string) {
    return this.reply('share_battle', [userId, otherId], z.boolean())
  }

  async onboardingProgress(userId: string) {
    const stored = await this.read('onboarding_by_user', [userId], onboarding)
    return foldOnboardingProgress(stored, stored.facts)
  }

  async updateOnboardingProgress(userId: string, operation: OnboardingProgressOperation) {
    const stored = await this.read(
      'update_onboarding',
      [userId, operation.operation, 'task' in operation ? operation.task : ''],
      onboarding,
    )
    return foldOnboardingProgress(stored, stored.facts)
  }

  async roster(id: string) {
    return (await this.read('roster_by_id', [id], rosterRow.nullable())) ?? undefined
  }

  async rostersByUser(userId: string) {
    return this.readRosters(userId, false, 1_000)
  }

  async rostersByIds(userId: string, ids: string[]) {
    return this.read('rosters_by_ids', [userId, ids], z.array(rosterRow).max(ROSTER_LIBRARY_BATCH_SIZE))
  }

  async homeRostersByUser(userId: string) {
    return this.read('home_rosters_by_user', [userId], z.object({ count: z.number().int().nonnegative(), rows: z.array(rosterRow).max(5) }))
  }

  async publicRostersByUser(userId: string, limit: number) {
    return this.readRosters(userId, true, limit)
  }

  async discoverRosters(query: RosterDiscoveryQuery) {
    return this.read(
      'discover_rosters',
      [JSON.stringify(query)],
      z.object({ rows: z.array(rosterRow).max(ROSTER_DISCOVERY_MAX_PAGE_SIZE), nextCursor: rosterDiscoveryCursorSchema.nullable() }),
    )
  }

  /** The base first, then its variants in the order they were made. */
  async rosterGroupByUser(userId: string, baseRosterId: string) {
    return this.read(
      'roster_group_by_user',
      [userId, baseRosterId],
      z.array(z.object({ id: z.string(), name: z.string(), automaticName: z.boolean().nullable() })).max(1_000),
    )
  }

  async rosterSummariesByUser(userId: string) {
    return this.read('roster_summaries_by_user', [userId], z.array(rosterSummaryRow).max(1_000))
  }

  private async readRosters(userId: string, publicOnly: boolean, limit: number) {
    return this.read('rosters_by_user', [userId, publicOnly, limit], z.array(rosterRow))
  }

  async syncRoster(input: { row: string; operationId: string; fingerprint: string; expectedVersion: number | null; deleted: boolean }) {
    return this.read(
      'sync_roster',
      [JSON.stringify(input)],
      z.discriminatedUnion('outcome', [
        z.object({
          outcome: z.literal('applied'),
          version: z.number().int().nonnegative(),
          deleted: z.boolean(),
          lifecycle: z.enum(['created', 'deleted']).nullable().default(null),
        }),
        z.object({ outcome: z.enum(['conflict', 'refused']), message: z.string() }),
      ]),
    )
  }

  async saveRoster(input: SaveRosterInput) {
    const outcome = await this.reply(
      'save_roster',
      [
        JSON.stringify({
          ...input,
          optionalRules: input.optionalRules ?? '[]',
          borrowedDetachmentId: input.borrowedDetachmentId ?? null,
        }),
      ],
      z.enum(['inserted', 'updated', 'forbidden', 'locked']),
    )
    return outcome === 'forbidden' ? null : outcome
  }

  async setRosterVisibility(id: string, userId: string, visibility: RosterVisibility, now: number) {
    return this.reply('set_roster_visibility', [id, userId, visibility, now], z.boolean())
  }

  async setRosterLocked(id: string, userId: string, locked: boolean, now: number) {
    return this.reply('set_roster_locked', [id, userId, locked, now], z.boolean())
  }

  async setRosterArchived(id: string, userId: string, archived: boolean, now: number) {
    return this.reply('set_roster_archived', [id, userId, archived, now], z.boolean())
  }

  async deleteRoster(id: string, userId: string) {
    await this.call('delete_roster', [id, userId])
  }

  async lendRoster(rosterId: string, ownerId: string, borrowerId: string, now: number) {
    return this.reply('lend_roster', [rosterId, ownerId, borrowerId, now], z.enum(['lent', 'forbidden', 'not-friends', 'too-many']))
  }

  async endRosterLoan(rosterId: string, userId: string, borrowerId: string) {
    return this.reply('end_roster_loan', [rosterId, userId, borrowerId], z.boolean())
  }

  async rosterLoansByRoster(rosterId: string, ownerId: string) {
    return this.read('roster_loans_by_roster', [rosterId, ownerId], z.array(z.object({ borrowerId: z.string(), lentAt: z.number().int() })))
  }

  async usableRoster(id: string, userId: string) {
    return this.read('usable_roster', [id, userId], z.object({ roster: rosterRow, lentBy: z.string().nullable() }).nullable())
  }

  async rostersLentTo(userId: string) {
    return this.read('rosters_lent_to', [userId], z.array(lentRosterRow).max(1_000))
  }

  async collectionProfile(userId: string, viewerId: string | null) {
    return this.read('collection_profile', [userId, viewerId === null ? { none: [] } : { some: viewerId }], collectionProfileSchema)
  }

  async setCollectionPublished(userId: string, published: boolean) {
    return this.reply('set_collection_published', [userId, published], z.boolean())
  }

  async collectionByUser(userId: string) {
    return this.read('collection_by_user', [userId], z.array(collectionRow))
  }

  async addToCollection(input: { userId: string; entryId: string; now: number }) {
    await this.call('add_to_collection', [input.userId, input.entryId, input.now])
  }

  async removeFromCollection(userId: string, entryId: string) {
    await this.call('remove_from_collection', [userId, entryId])
  }

  async setCollectionModels(input: { userId: string; entryId: string; models: number; now: number }) {
    await this.call('set_collection_models', [input.userId, input.entryId, input.models, input.now])
  }

  async setCollectionProgress(input: { userId: string; entryId: string; built: number; painted: number }) {
    await this.call('set_collection_progress', [input.userId, input.entryId, input.built, input.painted])
  }

  async collectionWishesByUser(userId: string) {
    return this.read('collection_wishes_by_user', [userId], z.array(z.object({ entryId: z.string(), wanted: z.number().int().positive() })))
  }

  async setCollectionWanted(input: { userId: string; entryId: string; wanted: number; now: number }) {
    await this.call('set_collection_wanted', [input.userId, input.entryId, input.wanted, input.now])
  }

  async importCollection(input: { userId: string; rows: CollectionImportRow[]; replace: boolean; now: number }) {
    return this.read(
      'import_collection',
      [input.userId, JSON.stringify(input.rows), input.replace, input.now],
      z.object({ added: z.number().int(), replaced: z.number().int(), kept: z.number().int() }),
    )
  }

  async setCollectionPhoto(input: { userId: string; entryId: string; photoId: string; now: number }) {
    await this.call('set_collection_photo', [input.userId, input.entryId, input.photoId, input.now])
  }

  async removeCollectionPhoto(userId: string, photoId: string) {
    await this.call('remove_collection_photo', [userId, photoId])
  }

  async collectionPhoto(photoId: string, viewerId: string | null) {
    return this.read(
      'collection_photo',
      [photoId, viewerId === null ? { none: [] } : { some: viewerId }],
      z.object({ userId: z.string(), entryId: z.string() }).nullable(),
    )
  }

  async datasheetPhotos(entryId: string, viewerId: string | null, limit: number) {
    return this.read(
      'datasheet_photos',
      [entryId, viewerId === null ? { none: [] } : { some: viewerId }, limit],
      z
        .array(
          z.object({
            photoId: z.uuid(),
            userId: z.string(),
            at: z.number().int(),
            likes: z.number().int().nonnegative(),
            liked: z.boolean(),
          }),
        )
        .max(100),
    )
  }

  async setCollectionPhotoLike(input: { userId: string; photoId: string; liked: boolean; now: number }) {
    await this.call('set_collection_photo_like', [input.userId, input.photoId, input.liked, input.now])
  }

  async removeCollectionPhotoById(photoId: string) {
    await this.call('remove_collection_photo_by_id', [photoId])
  }

  async collectionPhotoForAdmin(photoId: string) {
    return this.read('collection_photo_for_admin', [photoId], z.object({ userId: z.string(), entryId: z.string() }).nullable())
  }

  async reportCollectionPhoto(input: { userId: string; photoId: string }) {
    await this.call('report_collection_photo', [input.userId, input.photoId])
  }

  async keepCollectionPhoto(photoId: string) {
    await this.call('keep_collection_photo', [photoId])
  }

  async heldCollectionPhotos(limit: number) {
    return this.read(
      'held_collection_photos',
      [limit],
      z.array(z.object({ photoId: z.uuid(), userId: z.string(), entryId: z.string(), at: z.number().int(), shown: z.boolean() })).max(100),
    )
  }

  async recentCollectionPhotos(limit: number) {
    return this.read(
      'recent_collection_photos',
      [limit],
      z.array(z.object({ photoId: z.uuid(), userId: z.string(), entryId: z.string(), at: z.number().int() })).max(100),
    )
  }

  async collectionPhotoDeletions(limit: number) {
    return this.read('collection_photo_deletions', [limit], z.array(z.string()).max(1_000))
  }

  async collectionPhotoIds(after: string | null, limit: number) {
    return this.read('collection_photo_ids', [after === null ? { none: [] } : { some: after }, limit], z.array(z.uuid()).max(100))
  }

  async clearCollectionPhotoDeletions(photoIds: readonly string[]) {
    await this.call('clear_collection_photo_deletions', [photoIds])
  }

  async queueCollectionPhotoDeletion(photoId: string) {
    await this.call('queue_collection_photo_deletion', [photoId])
  }

  async favouriteFactionsByUser(userId: string) {
    return this.read('favourite_factions_by_user', [userId], z.array(favouriteFactionRow))
  }

  async addFavouriteFaction(input: { userId: string; catalogueId: string; now: number }) {
    await this.call('add_favourite_faction', [input.userId, input.catalogueId, input.now])
  }

  async removeFavouriteFaction(userId: string, catalogueId: string) {
    await this.call('remove_favourite_faction', [userId, catalogueId])
  }

  async favouriteDetachmentsByUser(userId: string) {
    return this.read('favourite_detachments_by_user', [userId], z.array(favouriteDetachmentRow))
  }

  async addFavouriteDetachment(input: { userId: string; catalogueId: string; detachmentId: string; now: number }) {
    await this.call('add_favourite_detachment', [input.userId, input.catalogueId, input.detachmentId, input.now])
  }

  async removeFavouriteDetachment(userId: string, catalogueId: string, detachmentId: string) {
    await this.call('remove_favourite_detachment', [userId, catalogueId, detachmentId])
  }

  async favouriteDatasheetsByUser(userId: string) {
    return this.read('favourite_datasheets_by_user', [userId], z.array(favouriteDatasheetRow))
  }

  async addFavouriteDatasheet(input: { userId: string; entryId: string; now: number }) {
    await this.call('add_favourite_datasheet', [input.userId, input.entryId, input.now])
  }

  async removeFavouriteDatasheet(userId: string, entryId: string) {
    await this.call('remove_favourite_datasheet', [userId, entryId])
  }

  async unitLoadoutsByUser(userId: string) {
    return this.read('unit_loadouts_by_user', [userId], z.array(unitLoadoutRow))
  }

  async saveUnitLoadout(id: string, userId: string, loadout: UnitLoadout, now: number) {
    return this.reply('save_unit_loadout', [id, userId, JSON.stringify(loadout), now], z.enum(['saved', 'full', 'refused']))
  }

  async renameUnitLoadout(id: string, userId: string, name: string) {
    return this.reply('rename_unit_loadout', [id, userId, name], z.boolean())
  }

  async deleteUnitLoadout(id: string, userId: string) {
    return this.reply('delete_unit_loadout', [id, userId], z.boolean())
  }

  async recentMatchupsByUser(userId: string) {
    return this.read('recent_matchups_by_user', [userId], z.array(recentMatchupRow))
  }

  async rememberMatchup(input: RecentMatchup & { userId: string; pairing: string; now: number }) {
    await this.call('remember_matchup', [input.userId, input.pairing, input.shared, input.attacker, input.defender, input.now])
  }

  async forgetMatchup(userId: string, pairing: string) {
    await this.call('forget_matchup', [userId, pairing])
  }

  async pushEnabled(userId: string) {
    return this.reply('push_enabled', [userId], z.boolean())
  }

  async setPushEnabled(userId: string, enabled: boolean, now: number) {
    return this.reply('set_push_enabled', [userId, enabled, now], z.boolean())
  }

  async playerDefaults(userId: string) {
    return this.read('player_defaults', [userId], playerDefaultsSchema)
  }

  async setPlayerDefaults(userId: string, defaults: PlayerDefaults, now: number) {
    return this.read('set_player_defaults', [userId, defaults.rosterVisibility, defaults.battleSize, now], playerDefaultsSchema)
  }

  async registerPushToken(input: { userId: string; token: string; platform: 'ios' | 'android'; now: number }) {
    await this.call('register_push_token', [input.userId, input.token, input.platform, input.now])
  }

  async unregisterPushToken(userId: string, token: string) {
    await this.call('unregister_push_token', [userId, token])
  }

  async deletePushTokens(tokens: readonly string[]) {
    if (tokens.length) await this.call('delete_push_tokens', [[...new Set(tokens)]])
  }

  async pushTargets(userIds: readonly string[]) {
    if (!userIds.length) return []
    return this.read('push_targets', [[...new Set(userIds)]], z.array(pushTarget))
  }

  async leagueNames(tokens: readonly string[]) {
    if (!tokens.length) return new Map<string, string>()
    const pairs = await this.read('league_names', [[...new Set(tokens)]], z.array(z.tuple([z.string(), z.string()])))
    return new Map(pairs)
  }

  async leagueByToken(token: string, eventToken?: string) {
    return this.read('league_by_token', [token, eventToken ?? ''], leagueRecord.nullable())
  }

  async leaguesVisibleTo(userId: string | null, limit: number) {
    return this.read('leagues_visible_to', [userId ?? '', limit], z.array(visibleLeague))
  }

  async outdatedLeagueEntriesForRoster(userId: string, rosterId: string) {
    return this.read('outdated_league_entries_for_roster', [userId, rosterId], z.array(outdatedLeagueEntry))
  }

  async friendLeagueRosters(viewerId: string) {
    return this.read('friend_league_rosters', [viewerId], z.array(friendLeagueRoster))
  }

  async leagueBattleCandidates(userId: string, participantIds: readonly string[]) {
    return this.read('league_battle_candidates', [userId, [...participantIds]], z.array(leagueCandidate))
  }

  async leagueRosters(token: string, userId: string, eventToken?: string, readerId?: string | null) {
    return this.read('league_rosters', [token, userId, eventToken ?? '', readerId ?? ''], z.array(leagueRoster))
  }

  async leagueRosterSharing(token: string, eventToken: string, userId: string) {
    return this.read('league_roster_sharing', [token, eventToken, userId], leagueRosterSharingSchema.nullable())
  }

  async leagueCommand<S extends z.ZodType>(command: Record<string, unknown>, result: S): Promise<z.output<S>> {
    return this.read('league_command', [JSON.stringify(command)], result)
  }

  /** A procedure returns its result as a JSON string. */
  private async read<S extends z.ZodType>(name: string, arguments_: unknown[], schema: S): Promise<z.output<S>> {
    return schema.parse(JSON.parse(await this.reply(name, arguments_, z.string())))
  }

  private async reply<S extends z.ZodType>(reducer: string, arguments_: unknown[], schema: S): Promise<z.output<S>> {
    return schema.parse(await (await this.call(reducer, arguments_)).json())
  }

  async syncReceipt(id: string, owner: string, fingerprint: string) {
    return this.read(
      'sync_receipt',
      [id, owner, fingerprint],
      z.object({ outcome: z.enum(['applied', 'refused']), message: z.string() }).nullable(),
    )
  }

  private async call(reducer: string, arguments_: unknown[]): Promise<Response> {
    const context = offlineContext.getStore()
    if (context && SYNC_PRODUCT_ACTIONS.has(reducer)) {
      if (context.wrote) throw new Error('A saved action must commit in one transaction.')
      context.wrote = true
      const response = await this.call('sync_product', [
        JSON.stringify({
          id: context.id,
          owner: context.owner,
          fingerprint: context.fingerprint,
          createdAt: context.createdAt,
          name: reducer,
          args: arguments_,
          reportApplied: true,
        }),
      ])
      const result = z.object({ result: z.string(), applied: z.boolean() }).parse(JSON.parse(z.string().parse(await response.json())))
      context.applied = result.applied
      return new Response(result.result, { headers: { 'content-type': 'application/json' } })
    }
    return callSpacetime(this.connection, reducer, arguments_)
  }
}
