import { z } from 'zod'
import { ROSTER_SOURCES, ROSTER_VISIBILITIES, type RosterSource, type RosterVisibility } from '../core/savedRoster'
import type { RosterRepository } from '../db/repositories/rosterRepository'
import type { NotificationRepository } from '../db/repositories/notificationRepository'
import { reduceBattle, type Command, type LoggedCommand, type SubmitResult } from '../core/battle'
import { commandSchema } from '../core/commands'
import { BATTLE_AUDIENCES, DEFAULT_BATTLE_AUDIENCE, type BattleAudience } from '../core/battleAudience'
import { onboardingProgress as foldOnboardingProgress, type OnboardingProgressOperation } from '../core/onboarding'

const rosterRow = z.strictObject({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  catalogueId: z.string(),
  detachmentId: z.string().nullable(),
  disposition: z.string().nullable(),
  limit: z.number().int(),
  picks: z.string(),
  prep: z.string().nullable(),
  tags: z.string(),
  waivedRules: z.string(),
  optionalRules: z.string(),
  borrowedDetachmentId: z.string().nullable(),
  visibility: z.enum(ROSTER_VISIBILITIES),
  source: z.enum(ROSTER_SOURCES),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})

const collectionRow = z.strictObject({ userId: z.string(), entryId: z.string(), at: z.number().int() })
const favouriteFactionRow = z.strictObject({ userId: z.string(), catalogueId: z.string(), at: z.number().int() })
const favouriteDetachmentRow = z.strictObject({
  userId: z.string(),
  catalogueId: z.string(),
  detachmentId: z.string(),
  at: z.number().int(),
})
const pushTarget = z.strictObject({ userId: z.string(), token: z.string() })
const battleSnapshot = z.strictObject({
  battle: z.strictObject({ id: z.string(), token: z.string(), createdAt: z.number().int() }),
  seats: z.array(z.strictObject({ id: z.string(), side: z.number().int(), automated: z.boolean() })),
  log: z.array(z.strictObject({ seq: z.number().int(), by: z.string(), at: z.number().int(), command: commandSchema })),
})
const battleFeedResult = z.strictObject({
  battles: z.array(z.strictObject({ ...battleSnapshot.shape, at: z.number().int() })),
  nextCursor: z.strictObject({ at: z.number().int(), id: z.string() }).nullable(),
})
const submission = z.strictObject({
  result: z.discriminatedUnion('outcome', [
    z.strictObject({ outcome: z.literal('stale'), seq: z.number().int() }),
    z.strictObject({ outcome: z.literal('refused'), reason: z.string() }),
    z.strictObject({ outcome: z.literal('appended'), seq: z.number().int() }),
  ]),
  log: battleSnapshot.shape.log,
})
const friendship = z.strictObject({ requesterId: z.string(), addresseeId: z.string(), acceptedAt: z.number().int().nullable() })
const productStat = z.strictObject({
  userId: z.string(),
  rosterCount: z.number().int().nonnegative(),
  battleCount: z.number().int().nonnegative(),
  practiceOpponent: z.boolean(),
})
const invite = z.strictObject({ token: z.string(), inviterId: z.string() })
const acceptedInvite = z.union([z.enum(['missing', 'self', 'already-friends']), z.strictObject({ inviterId: z.string() })])
const onboarding = z.strictObject({
  welcomed: z.boolean(),
  tasks: z.array(z.strictObject({ task: z.string(), state: z.enum(['completed', 'skipped']) })),
  facts: z.strictObject({ roster: z.boolean(), friend: z.boolean(), battle: z.boolean(), league: z.boolean() }),
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
  format: z.enum(['1v1', '2v1', '2v2']).nullable(),
  rosterLimit: z.number().int().nullable(),
  createdAt: z.number().int(),
  revealedAt: z.number().int().nullable(),
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
  latestEntryCount: z.number().int(),
  latestAcceptedCount: z.number().int(),
})
const visibleLeague = z.object({
  league,
  event: leagueEvent,
  personal: z.boolean(),
  joined: z.number().int(),
  accepted: z.number().int(),
  occupied: z.number().int(),
  ownEntry: leagueEntry.nullable(),
})
const leagueCandidate = z.object({ league, event: leagueEvent, entries: z.array(leagueEntry) })
const leagueRoster = z.object({ event: leagueEvent, entry: leagueEntry, reader: leagueEntry.nullable() })

type SaveRosterInput = {
  id: string
  userId: string
  name: string
  catalogueId: string
  detachmentId: string | null
  disposition: string | null
  limit: number
  picks: string
  prep: string | null
  tags: string
  waivedRules: string
  optionalRules?: string
  borrowedDetachmentId?: string | null
  visibility: RosterVisibility
  source: RosterSource
  now: number
}

export class SpacetimeOperator
  implements Pick<RosterRepository, keyof RosterRepository>, Pick<NotificationRepository, keyof NotificationRepository>
{
  private readonly baseUrl: URL

  constructor(
    baseUrl: string,
    private readonly database: string,
    private readonly token: string,
    private readonly request: typeof fetch = fetch,
    private readonly access?: { clientId: string; clientSecret: string },
  ) {
    const parsed = new URL(baseUrl)
    const local = parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)
    if (
      (!local && parsed.protocol !== 'https:') ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== '/'
    ) {
      throw new Error('Invalid SpacetimeDB URL')
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(database)) throw new Error('Invalid SpacetimeDB database name')
    if (!token) throw new Error('SpacetimeDB operator token is required')
    this.baseUrl = parsed
  }

  async revokeSession(sessionId: string) {
    if (!sessionId || sessionId.length > 128) throw new Error('Invalid session ID')
    await this.call('revoke_session', [sessionId])
  }

  async health() {
    const response = await this.call('operator_health', [])
    return z.literal(true).parse(await response.json())
  }

  async deleteUserData(userId: string) {
    if (!userId || userId.length > 128) throw new Error('Invalid user ID')
    await this.call('delete_user_data', [userId])
  }

  async battleForOperator(battleId: string) {
    return battleSnapshot.parse(await this.read('battle_for_operator', [battleId]))
  }

  async createBattle(input: {
    id: string
    token: string
    userId: string
    allyIds?: string[]
    opponentIds?: string[]
    initialCommand?: Command
    initialCommands?: Command[]
    now: number
  }) {
    return battleSnapshot.parse(
      await this.read('create_battle', [
        JSON.stringify({
          id: input.id,
          token: input.token,
          userId: input.userId,
          allyIds: input.allyIds ?? [],
          opponentIds: input.opponentIds ?? [],
          initialCommands: input.initialCommands ?? (input.initialCommand ? [input.initialCommand] : []),
          now: input.now,
        }),
      ]),
    )
  }

  async battleByToken(token: string) {
    return battleSnapshot.nullable().parse(await this.read('battle_by_token', [token])) ?? undefined
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
    return battleFeedResult.parse(
      await this.read('battle_feed', [
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
      ]),
    )
  }

  async deleteBattle(battleId: string, userId: string) {
    const response = await this.call('remove_battle', [battleId, userId])
    return z.boolean().parse(await response.json())
  }

  async log(battleId: string) {
    return (await this.battleForOperator(battleId)).log
  }

  async submit(
    input: { battleId: string; userId: string; expectedSeq: number; command: Command; now: number },
    validateState?: (state: ReturnType<typeof reduceBattle>) => string | null,
    resolveCommand: (state: ReturnType<typeof reduceBattle>, command: Command) => Command = (_, command) => command,
  ): Promise<{ result: SubmitResult; log: LoggedCommand[] }> {
    const snapshot = await this.battleForOperator(input.battleId)
    const state = reduceBattle(
      snapshot.seats.map((seat) => seat.id),
      snapshot.log,
      snapshot.seats.map((seat) => seat.side),
      snapshot.seats.filter((seat) => seat.automated).map((seat) => seat.id),
    )
    const command = state.seq === input.expectedSeq ? commandSchema.parse(resolveCommand(state, input.command)) : input.command
    const externalRefusal = state.seq === input.expectedSeq ? (validateState?.(state) ?? null) : null
    const response = await this.call('submit_battle', [
      input.battleId,
      input.userId,
      input.expectedSeq,
      JSON.stringify(command),
      input.now,
      externalRefusal ?? '',
    ])
    return submission.parse(JSON.parse(z.string().parse(await response.json())))
  }

  async friendshipsByUser(userId: string) {
    return z.array(friendship).parse(await this.read('friendships_by_user', [userId]))
  }

  async productStats(userIds: readonly string[]) {
    if (!userIds.length) return new Map<string, z.infer<typeof productStat>>()
    const rows = z.array(productStat).parse(await this.read('product_stats', [[...new Set(userIds)]]))
    return new Map(rows.map((row) => [row.userId, row]))
  }

  async practiceOpponentIds() {
    return z.array(z.string()).parse(await this.read('practice_opponent_ids', []))
  }

  async requestFriend(requesterId: string, addresseeId: string, now: number) {
    const response = await this.call('request_friend', [requesterId, addresseeId, now])
    return z.boolean().parse(await response.json())
  }

  async acceptFriend(requesterId: string, addresseeId: string, now: number) {
    const response = await this.call('accept_friend', [requesterId, addresseeId, now])
    return z.boolean().parse(await response.json())
  }

  async rejectFriend(requesterId: string, addresseeId: string) {
    const response = await this.call('reject_friend', [requesterId, addresseeId])
    return z.boolean().parse(await response.json())
  }

  async removeFriend(leftId: string, rightId: string) {
    const response = await this.call('remove_friend', [leftId, rightId])
    return z.boolean().parse(await response.json())
  }

  async friendInviteByInviter(inviterId: string) {
    return z
      .string()
      .nullable()
      .parse(await this.read('friend_invite_by_inviter', [inviterId]))
  }

  async friendInviteByToken(token: string) {
    return invite.nullable().parse(await this.read('friend_invite_by_token', [token]))
  }

  async replaceFriendInvite(inviterId: string, token: string, now: number) {
    await this.call('replace_friend_invite', [inviterId, token, now])
  }

  async cancelFriendInvite(inviterId: string) {
    const response = await this.call('cancel_friend_invite', [inviterId])
    return z.boolean().parse(await response.json())
  }

  async acceptFriendInvite(token: string, recipientId: string, now: number) {
    return acceptedInvite.parse(await this.read('accept_friend_invite', [token, recipientId, now]))
  }

  async battleAudiences(userIds: readonly string[]) {
    if (!userIds.length) return new Map<string, BattleAudience>()
    const rows = z
      .array(z.strictObject({ userId: z.string(), audience: z.enum(BATTLE_AUDIENCES) }))
      .parse(await this.read('battle_audiences', [[...new Set(userIds)]]))
    return new Map(rows.map((row) => [row.userId, row.audience]))
  }

  async battleAudience(userId: string): Promise<BattleAudience> {
    return (await this.battleAudiences([userId])).get(userId) ?? DEFAULT_BATTLE_AUDIENCE
  }

  async setBattleAudience(userId: string, audience: BattleAudience, now: number) {
    const response = await this.call('set_battle_audience', [userId, audience, now])
    return z.enum(BATTLE_AUDIENCES).parse(await response.json())
  }

  async shareBattle(userId: string, otherId: string) {
    const response = await this.call('share_battle', [userId, otherId])
    return z.boolean().parse(await response.json())
  }

  async onboardingProgress(userId: string) {
    const stored = onboarding.parse(await this.read('onboarding_by_user', [userId]))
    return foldOnboardingProgress(stored, stored.facts)
  }

  async updateOnboardingProgress(userId: string, operation: OnboardingProgressOperation) {
    const stored = onboarding.parse(
      await this.read('update_onboarding', [userId, operation.operation, 'task' in operation ? operation.task : '']),
    )
    return foldOnboardingProgress(stored, stored.facts)
  }

  async roster(id: string) {
    return rosterRow.nullable().parse(await this.read('roster_by_id', [id])) ?? undefined
  }

  async rostersByUser(userId: string) {
    return this.readRosters(userId, false, 1_000)
  }

  async publicRostersByUser(userId: string, limit: number) {
    return this.readRosters(userId, true, limit)
  }

  async rosterSummariesByUser(userId: string) {
    return this.rostersByUser(userId)
  }

  private async readRosters(userId: string, publicOnly: boolean, limit: number) {
    return z.array(rosterRow).parse(await this.read('rosters_by_user', [userId, publicOnly, limit]))
  }

  async saveRoster(input: SaveRosterInput) {
    const response = await this.call('save_roster', [
      JSON.stringify({
        ...input,
        optionalRules: input.optionalRules ?? '[]',
        borrowedDetachmentId: input.borrowedDetachmentId ?? null,
      }),
    ])
    const outcome = z.enum(['inserted', 'updated', 'forbidden']).parse(await response.json())
    return outcome === 'forbidden' ? null : outcome
  }

  async setRosterVisibility(id: string, userId: string, visibility: RosterVisibility, now: number) {
    const response = await this.call('set_roster_visibility', [id, userId, visibility, now])
    return z.boolean().parse(await response.json())
  }

  async deleteRoster(id: string, userId: string) {
    await this.call('delete_roster', [id, userId])
  }

  async collectionByUser(userId: string) {
    return z.array(collectionRow).parse(await this.read('collection_by_user', [userId]))
  }

  async addToCollection(input: { userId: string; entryId: string; now: number }) {
    await this.call('add_to_collection', [input.userId, input.entryId, input.now])
  }

  async removeFromCollection(userId: string, entryId: string) {
    await this.call('remove_from_collection', [userId, entryId])
  }

  async favouriteFactionsByUser(userId: string) {
    return z.array(favouriteFactionRow).parse(await this.read('favourite_factions_by_user', [userId]))
  }

  async addFavouriteFaction(input: { userId: string; catalogueId: string; now: number }) {
    await this.call('add_favourite_faction', [input.userId, input.catalogueId, input.now])
  }

  async removeFavouriteFaction(userId: string, catalogueId: string) {
    await this.call('remove_favourite_faction', [userId, catalogueId])
  }

  async favouriteDetachmentsByUser(userId: string) {
    return z.array(favouriteDetachmentRow).parse(await this.read('favourite_detachments_by_user', [userId]))
  }

  async addFavouriteDetachment(input: { userId: string; catalogueId: string; detachmentId: string; now: number }) {
    await this.call('add_favourite_detachment', [input.userId, input.catalogueId, input.detachmentId, input.now])
  }

  async removeFavouriteDetachment(userId: string, catalogueId: string, detachmentId: string) {
    await this.call('remove_favourite_detachment', [userId, catalogueId, detachmentId])
  }

  async pushEnabled(userId: string) {
    const response = await this.call('push_enabled', [userId])
    return z.boolean().parse(await response.json())
  }

  async setPushEnabled(userId: string, enabled: boolean, now: number) {
    const response = await this.call('set_push_enabled', [userId, enabled, now])
    return z.boolean().parse(await response.json())
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
    return z.array(pushTarget).parse(await this.read('push_targets', [[...new Set(userIds)]]))
  }

  async leagueNames(tokens: readonly string[]) {
    if (!tokens.length) return new Map<string, string>()
    const pairs = z.array(z.tuple([z.string(), z.string()])).parse(await this.read('league_names', [[...new Set(tokens)]]))
    return new Map(pairs)
  }

  async leagueByToken(token: string, eventToken?: string) {
    return leagueRecord.nullable().parse(await this.read('league_by_token', [token, eventToken ?? '']))
  }

  async leaguesVisibleTo(userId: string | null, limit: number) {
    return z.array(visibleLeague).parse(await this.read('leagues_visible_to', [userId ?? '', limit]))
  }

  async leagueBattleCandidates(userId: string, participantIds: readonly string[]) {
    return z.array(leagueCandidate).parse(await this.read('league_battle_candidates', [userId, [...participantIds]]))
  }

  async leagueRosters(token: string, userId: string, eventToken?: string, readerId?: string | null) {
    return z.array(leagueRoster).parse(await this.read('league_rosters', [token, userId, eventToken ?? '', readerId ?? '']))
  }

  async leagueCommand<S extends z.ZodType>(command: Record<string, unknown>, result: S): Promise<z.output<S>> {
    return result.parse(await this.read('league_command', [JSON.stringify(command)]))
  }

  private async read(name: string, arguments_: unknown[]) {
    const response = await this.call(name, arguments_)
    return JSON.parse(z.string().parse(await response.json())) as unknown
  }

  private async call(reducer: string, arguments_: unknown[]) {
    const endpoint = new URL(`/v1/database/${this.database}/call/${reducer}`, this.baseUrl)
    const response = await this.request(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
        ...(this.access ? { 'CF-Access-Client-Id': this.access.clientId, 'CF-Access-Client-Secret': this.access.clientSecret } : {}),
      },
      body: JSON.stringify(arguments_),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok)
      throw new Error(
        `SpacetimeDB ${reducer} failed with HTTP ${response.status} at ${endpoint.host} (Access domain: ${response.headers.get('cf-access-domain') ?? 'none'}, ray: ${response.headers.get('cf-ray') ?? 'none'}): ${(await response.text()).slice(0, 300)}`,
      )
    return response
  }
}
