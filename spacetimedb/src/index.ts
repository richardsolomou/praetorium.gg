import { ScheduleAt } from 'spacetimedb'
import { SenderError, schema, table, t, type InferSchema, type ReducerCtx } from 'spacetimedb/server'
import { ROSTER_SOURCES, ROSTER_VISIBILITIES } from '../../src/core/savedRoster'
import { attachedUnitCount } from '../../src/core/attachedUnits'
import { ROSTER_LIBRARY_BATCH_SIZE } from '../../src/core/rosterLibrary'
import { DEFAULT_PUSH_NOTIFICATIONS, PUSH_TOKENS_PER_USER, PUSH_PLATFORMS } from '../../src/core/notificationConfig'
import { reduceBattle, validate, type FormatRuleId, type LoggedCommand } from '../../src/core/battle'
import { commandSchema } from '../../src/core/commands'
import { BATTLE_AUDIENCES, DEFAULT_BATTLE_AUDIENCE } from '../../src/core/battleAudience'
import { DEFAULT_PLAYER_DEFAULTS, isPlayerDefaults } from '../../src/core/playerDefaults'
import { onboardingTaskIds, tourTaskIds } from '../../src/core/onboarding'
import {
  alliedLeagueRosterLimit,
  leaguePlacesSeat,
  leagueWarlords,
  leagueRegistrationFull,
  leagueRevealChecklist,
  matchesSealedLeagueRoster,
  requiredLeagueRosterLimit,
} from '../../src/core/league'
import { parseRosterSnapshot, rosterPickSchema } from '../../src/core/commands'
import { admitConnection } from './admission'
import { rosterReminderSchema } from '../../src/core/reminders'
import type { Roster } from '../../src/core/battle'
import { z } from 'zod'
import { productTables } from './productSchema'
import { productSyncRefusal } from './syncOutcome'

const settings = table(
  { name: 'settings' },
  {
    id: t.u8().primaryKey(),
    owner: t.identity(),
    operator: t.string(),
    issuer: t.string(),
    audience: t.string(),
  },
)

const sessionAccess = table(
  { name: 'session_access' },
  {
    subject: t.string().primaryKey(),
    identity: t.identity().index('btree'),
    userId: t.string().index('btree'),
    expiresAt: t.u64(),
  },
)

const adminSessions = table(
  { name: 'admin_sessions' },
  {
    subject: t.string().primaryKey(),
  },
)

const adminRevisions = table(
  { name: 'admin_revisions' },
  {
    scope: t.string().primaryKey(),
    revision: t.u64(),
  },
)

const revokedSession = table(
  { name: 'revoked_session' },
  {
    subject: t.string().primaryKey(),
  },
)

const accessExpiry = table(
  { name: 'access_expiry' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    subject: t.string(),
    scheduledAt: t.scheduleAt(),
  },
)

const revocationExpiry = table(
  { name: 'revocation_expiry' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    subject: t.string(),
    scheduledAt: t.scheduleAt(),
  },
)

const watchedBattles = table(
  { name: 'watched_battles' },
  {
    key: t.string().primaryKey(),
    subject: t.string().index('btree'),
    battleId: t.string().index('btree'),
  },
)

const spacetime = schema({
  settings,
  sessionAccess,
  adminSessions,
  adminRevisions,
  revokedSession,
  accessExpiry,
  revocationExpiry,
  watchedBattles,
  ...productTables,
})
export default spacetime

type Context = ReducerCtx<InferSchema<typeof spacetime>>

const MAX_TOKEN_SECONDS = 600n

function nowSeconds(ctx: Context) {
  return ctx.timestamp.microsSinceUnixEpoch / 1_000_000n
}

function revoke(ctx: Context, subject: string) {
  if (subject.length === 0 || subject.length > 128) throw new SenderError('Invalid session')
  if (ctx.db.revokedSession.subject.find(subject)) return
  ctx.db.revokedSession.insert({ subject })
  ctx.db.sessionAccess.subject.delete(subject)
  ctx.db.adminSessions.subject.delete(subject)
  for (const row of Array.from(ctx.db.watchedBattles.subject.filter(subject))) ctx.db.watchedBattles.key.delete(row.key)
  ctx.db.revocationExpiry.insert({
    scheduledId: 0n,
    subject,
    scheduledAt: ScheduleAt.time((nowSeconds(ctx) + MAX_TOKEN_SECONDS) * 1_000_000n),
  })
}

function activeSession(ctx: Context) {
  const current = ctx.db.sessionAccess.identity.filter(ctx.sender).next().value
  if (!current || current.expiresAt <= nowSeconds(ctx) || ctx.db.revokedSession.subject.find(current.subject)) {
    throw new SenderError('Session expired')
  }
  return current
}

function requireOperator(ctx: Context) {
  const configured = ctx.db.settings.id.find(0)
  if (!configured?.operator || ctx.sender.toHexString() !== configured.operator) throw new SenderError('Operator required')
}

type ProductScope = 'rosters' | 'collection' | 'favourites' | 'friends' | 'invites' | 'onboarding' | 'settings' | 'leagues' | 'battles'

function touchProduct(ctx: Context, userId: string, ...scopes: ProductScope[]) {
  for (const scope of scopes) {
    const key = JSON.stringify([userId, scope])
    const current = ctx.db.productRevisions.key.find(key)
    if (current) ctx.db.productRevisions.key.update({ ...current, revision: current.revision + 1n })
    else ctx.db.productRevisions.insert({ key, userId, scope, revision: 1n })
  }
}

type PublicScope = 'battles' | 'rosters' | 'leagues' | 'invites' | 'standings' | 'opponents'

function touchPublic(ctx: Context, scope: PublicScope) {
  const current = ctx.db.publicRevisions.scope.find(scope)
  if (current) ctx.db.publicRevisions.scope.update({ ...current, revision: current.revision + 1n })
  else ctx.db.publicRevisions.insert({ scope, revision: 1n })
}

function touchAdmin(ctx: Context) {
  const scope = 'admin-users'
  const current = ctx.db.adminRevisions.scope.find(scope)
  if (current) ctx.db.adminRevisions.scope.update({ ...current, revision: current.revision + 1n })
  else ctx.db.adminRevisions.insert({ scope, revision: 1n })
}

function touchFriends(ctx: Context, leftId: string, rightId: string) {
  touchProduct(ctx, leftId, 'friends', 'onboarding')
  touchProduct(ctx, rightId, 'friends', 'onboarding')
}

function touchLeague(ctx: Context, leagueId: string, eventId?: string) {
  const league = ctx.db.leagues.id.find(leagueId)
  if (!league) return
  const users = new Set([league.ownerId])
  const event = eventId ? ctx.db.leagueEvents.id.find(eventId) : leagueEventFor(ctx, leagueId, null)
  if (event) for (const entry of ctx.db.leagueEventEntries.eventId.filter(event.id)) users.add(entry.userId)
  for (const userId of users) touchProduct(ctx, userId, 'leagues', 'onboarding')
  touchPublic(ctx, 'leagues')
}

function deleteBattle(ctx: Context, battleId: string) {
  const seats = Array.from(ctx.db.battleUsers.battleId.filter(battleId))
  const leagueEvent = ctx.db.leagueEventBattles.battleId.find(battleId)
  for (const seat of seats) touchProduct(ctx, seat.userId, 'battles', 'onboarding')
  touchPublic(ctx, 'battles')
  touchPublic(ctx, 'standings')
  touchAdmin(ctx)
  if (leagueEvent) {
    const leagueId = ctx.db.leagueEvents.id.find(leagueEvent.eventId)?.leagueId
    if (leagueId) touchLeague(ctx, leagueId, leagueEvent.eventId)
  }
  for (const row of Array.from(ctx.db.watchedBattles.battleId.filter(battleId))) ctx.db.watchedBattles.key.delete(row.key)
  for (const row of Array.from(ctx.db.commands.battleId.filter(battleId))) ctx.db.commands.key.delete(row.key)
  for (const row of Array.from(ctx.db.battleUsers.battleId.filter(battleId))) ctx.db.battleUsers.key.delete(row.key)
  ctx.db.leagueEventBattles.battleId.delete(battleId)
  ctx.db.battles.id.delete(battleId)
}

function deleteLeague(ctx: Context, leagueId: string) {
  touchLeague(ctx, leagueId)
  for (const event of Array.from(ctx.db.leagueEvents.leagueId.filter(leagueId))) {
    for (const row of Array.from(ctx.db.leagueEventEntries.eventId.filter(event.id))) ctx.db.leagueEventEntries.key.delete(row.key)
    for (const row of Array.from(ctx.db.leagueEventBattles.eventId.filter(event.id)))
      ctx.db.leagueEventBattles.battleId.delete(row.battleId)
    ctx.db.leagueEvents.id.delete(event.id)
  }
  ctx.db.leagues.id.delete(leagueId)
}

export const init = spacetime.init((ctx) => {
  ctx.db.settings.insert({ id: 0, owner: ctx.sender, operator: '', issuer: '', audience: '' })
})

export const configure = spacetime.reducer({ issuer: t.string(), audience: t.string(), operator: t.string() }, (ctx, input) => {
  const current = ctx.db.settings.id.find(0)
  if (!current || !ctx.sender.isEqual(current.owner)) throw new SenderError('Only the database owner can configure auth')
  const secureIssuer = /^https:\/\/[^/?#@]+\/api\/auth(?:\/preview\/[0-9a-f]{40})?$/.test(input.issuer)
  const localIssuer = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::[0-9]{1,5})?\/api\/auth$/.test(input.issuer)
  if (
    input.issuer.length > 256 ||
    (!secureIssuer && !localIssuer) ||
    !/^[a-z0-9][a-z0-9-]{0,127}$/.test(input.audience) ||
    !/^[0-9a-f]{64}$/.test(input.operator)
  ) {
    throw new SenderError('Invalid auth configuration')
  }
  if (current.issuer) {
    if (current.issuer !== input.issuer || current.audience !== input.audience || current.operator !== input.operator) {
      throw new SenderError('Auth configuration is immutable')
    }
    return
  }
  ctx.db.settings.id.update({ ...current, ...input })
})

export const onConnect = spacetime.clientConnected((ctx) => {
  const configured = ctx.db.settings.id.find(0)
  const admission = admitConnection({
    trusted: Boolean(configured?.owner.isEqual(ctx.sender) || (configured?.operator && configured.operator === ctx.sender.toHexString())),
    senderHex: ctx.sender.toHexString(),
    jwt: ctx.senderAuth.jwt,
    issuer: configured?.issuer,
    audience: configured?.audience,
    now: nowSeconds(ctx),
    maxTokenSeconds: MAX_TOKEN_SECONDS,
    isRevoked: (subject) => Boolean(ctx.db.revokedSession.subject.find(subject)),
  })
  if (admission.kind === 'refused') throw new SenderError('Invalid auth token')
  if (admission.kind !== 'player') return
  const { subject, userId, expiresAt, isAdmin } = admission
  const current = ctx.db.sessionAccess.subject.find(subject)
  if (current && (!current.identity.isEqual(ctx.sender) || current.userId !== userId)) throw new SenderError('Session identity changed')
  if (current) ctx.db.sessionAccess.subject.update({ ...current, expiresAt })
  else
    ctx.db.sessionAccess.insert({
      subject,
      identity: ctx.sender,
      userId,
      expiresAt,
    })
  if (isAdmin && !ctx.db.adminSessions.subject.find(subject)) ctx.db.adminSessions.insert({ subject })
  if (!isAdmin) ctx.db.adminSessions.subject.delete(subject)
  ctx.db.accessExpiry.insert({ scheduledId: 0n, subject, scheduledAt: ScheduleAt.time(expiresAt * 1_000_000n) })
})

export const revokeOwnAccess = spacetime.reducer({}, (ctx) => {
  revoke(ctx, activeSession(ctx).subject)
})

export const revokeSession = spacetime.reducer({ subject: t.string() }, (ctx, { subject }) => {
  requireOperator(ctx)
  revoke(ctx, subject)
})

export const deleteUserData = spacetime.reducer({ userId: t.string() }, (ctx, { userId }) => {
  requireOperator(ctx)
  if (!userId || userId.length > 128) throw new SenderError('Invalid user ID')
  for (const row of Array.from(ctx.db.sessionAccess.userId.filter(userId))) revoke(ctx, row.subject)
  for (const row of Array.from(ctx.db.battleUsers.userId.filter(userId))) deleteBattle(ctx, row.battleId)
  for (const row of Array.from(ctx.db.leagues.ownerId.filter(userId))) deleteLeague(ctx, row.id)
  for (const row of Array.from(ctx.db.userOnboardingTasks.userId.filter(userId))) ctx.db.userOnboardingTasks.key.delete(row.key)
  ctx.db.userOnboarding.userId.delete(userId)
  ctx.db.battleSharing.userId.delete(userId)
  ctx.db.pushPreferences.userId.delete(userId)
  ctx.db.playerDefaults.userId.delete(userId)
  for (const row of Array.from(ctx.db.pushTokens.userId.filter(userId))) ctx.db.pushTokens.token.delete(row.token)
  for (const row of Array.from(ctx.db.friendships.requesterId.filter(userId))) {
    touchFriends(ctx, row.requesterId, row.addresseeId)
    ctx.db.friendships.key.delete(row.key)
  }
  for (const row of Array.from(ctx.db.friendships.addresseeId.filter(userId))) {
    touchFriends(ctx, row.requesterId, row.addresseeId)
    ctx.db.friendships.key.delete(row.key)
  }
  const invite = ctx.db.friendInvites.inviterId.find(userId)
  if (invite) {
    ctx.db.friendInvites.token.delete(invite.token)
    touchPublic(ctx, 'invites')
  }
  for (const row of Array.from(ctx.db.commands.userId.filter(userId))) ctx.db.commands.key.delete(row.key)
  for (const row of Array.from(ctx.db.battleUsers.userId.filter(userId))) ctx.db.battleUsers.key.delete(row.key)
  const ownedRosters = Array.from(ctx.db.rosters.userId.filter(userId))
  for (const row of ownedRosters) {
    if (row.visibility !== 'private') touchPublic(ctx, 'rosters')
    ctx.db.rosters.id.delete(row.id)
  }
  if (ownedRosters.length) touchAdmin(ctx)
  const affectedEvents = new Set<string>()
  for (const row of Array.from(ctx.db.leagueEventEntries.userId.filter(userId))) {
    affectedEvents.add(row.eventId)
    ctx.db.leagueEventEntries.key.delete(row.key)
  }
  for (const eventId of affectedEvents) {
    const leagueId = ctx.db.leagueEvents.id.find(eventId)?.leagueId
    if (leagueId) touchLeague(ctx, leagueId, eventId)
  }
  for (const row of Array.from(ctx.db.collection.userId.filter(userId))) ctx.db.collection.key.delete(row.key)
  for (const row of Array.from(ctx.db.favouriteFactions.userId.filter(userId))) ctx.db.favouriteFactions.key.delete(row.key)
  for (const row of Array.from(ctx.db.favouriteDetachments.userId.filter(userId))) ctx.db.favouriteDetachments.key.delete(row.key)
  if (ctx.db.practiceOpponents.userId.delete(userId)) {
    touchPublic(ctx, 'opponents')
    touchAdmin(ctx)
  }
  for (const row of Array.from(ctx.db.syncReceipts.owner.filter(userId))) ctx.db.syncReceipts.id.delete(row.id)
  for (const row of Array.from(ctx.db.rosterSync.userId.filter(userId))) ctx.db.rosterSync.id.delete(row.id)
  for (const row of Array.from(ctx.db.productRevisions.userId.filter(userId))) ctx.db.productRevisions.key.delete(row.key)
})

export const expireAccess = spacetime.reducer({ onSchedule: accessExpiry }, { timer: accessExpiry.rowType }, (ctx, { timer }) => {
  const current = ctx.db.sessionAccess.subject.find(timer.subject)
  if (current && current.expiresAt <= nowSeconds(ctx)) {
    ctx.db.sessionAccess.subject.delete(timer.subject)
    ctx.db.adminSessions.subject.delete(timer.subject)
    for (const row of Array.from(ctx.db.watchedBattles.subject.filter(timer.subject))) ctx.db.watchedBattles.key.delete(row.key)
  }
})

export const expireRevocation = spacetime.reducer(
  { onSchedule: revocationExpiry },
  { timer: revocationExpiry.rowType },
  (ctx, { timer }) => {
    ctx.db.revokedSession.subject.delete(timer.subject)
  },
)

export const mySession = spacetime.view({ name: 'my_session', public: true }, t.option(sessionAccess.rowType), (ctx) => {
  const current = ctx.db.sessionAccess.identity.filter(ctx.sender).next().value
  return current && !ctx.db.revokedSession.subject.find(current.subject) ? current : undefined
})

export const myProductSignals = spacetime.view(
  { name: 'my_product_signals', public: true },
  t.array(t.row('MyProductSignal', { scope: t.string().primaryKey(), revision: t.u64() })),
  (ctx) => {
    const session = ctx.db.sessionAccess.identity.filter(ctx.sender).next().value
    if (!session || ctx.db.revokedSession.subject.find(session.subject)) return []
    return Array.from(ctx.db.productRevisions.userId.filter(session.userId), ({ scope, revision }) => ({ scope, revision }))
  },
)

export const myAdminSignals = spacetime.view(
  { name: 'my_admin_signals', public: true },
  t.array(t.row('MyAdminSignal', { scope: t.string().primaryKey(), revision: t.u64() })),
  (ctx) => {
    const session = ctx.db.sessionAccess.identity.filter(ctx.sender).next().value
    if (!session || !ctx.db.adminSessions.subject.find(session.subject) || ctx.db.revokedSession.subject.find(session.subject)) return []
    return Array.from(ctx.db.adminRevisions.iter(), ({ scope, revision }) => ({ scope, revision }))
  },
)

export const publicProductSignals = spacetime.view(
  { name: 'public_product_signals', public: true },
  t.array(t.row('PublicProductSignal', { scope: t.string().primaryKey(), revision: t.u64() })),
  (ctx) => Array.from(ctx.db.publicRevisions.iter(), ({ scope, revision }) => ({ scope, revision })),
)

export const watchBattle = spacetime.reducer({ battleId: t.string() }, (ctx, { battleId }) => {
  const session = activeSession(ctx)
  if (!ctx.db.battleUsers.key.find(JSON.stringify([battleId, session.userId]))) throw new SenderError('Battle unavailable')
  const key = JSON.stringify([session.subject, battleId])
  if (ctx.db.watchedBattles.key.find(key)) return
  if (Array.from(ctx.db.watchedBattles.subject.filter(session.subject)).length >= 8) throw new SenderError('Too many watched battles')
  ctx.db.watchedBattles.insert({ key, subject: session.subject, battleId })
})

export const unwatchBattle = spacetime.reducer({ battleId: t.string() }, (ctx, { battleId }) => {
  const session = activeSession(ctx)
  ctx.db.watchedBattles.key.delete(JSON.stringify([session.subject, battleId]))
})

export const myBattleSignals = spacetime.view(
  { name: 'my_battle_signals', public: true },
  t.array(t.row('BattleSignal', { battleId: t.string().primaryKey(), seq: t.u32() })),
  (ctx) => {
    const session = ctx.db.sessionAccess.identity.filter(ctx.sender).next().value
    if (!session || ctx.db.revokedSession.subject.find(session.subject)) return []
    return Array.from(ctx.db.watchedBattles.subject.filter(session.subject)).flatMap(({ battleId }) => {
      if (!ctx.db.battleUsers.key.find(JSON.stringify([battleId, session.userId]))) return []
      let seq = 0
      for (const command of ctx.db.commands.battleId.filter(battleId)) seq = Math.max(seq, command.seq)
      return [{ battleId, seq }]
    })
  },
)

export const myBattleList = spacetime.view(
  { name: 'my_battle_list', public: true },
  t.array(t.row('MyBattleListEntry', { battleId: t.string().primaryKey(), seq: t.u32() })),
  (ctx) => {
    const session = ctx.db.sessionAccess.identity.filter(ctx.sender).next().value
    if (!session || ctx.db.revokedSession.subject.find(session.subject)) return []
    const recent: { battleId: string; seq: number; at: bigint }[] = []
    for (const { battleId } of ctx.db.battleUsers.userId.filter(session.userId)) {
      let seq = 0
      let at = ctx.db.battles.id.find(battleId)?.createdAt ?? 0n
      for (const command of ctx.db.commands.battleId.filter(battleId)) {
        seq = Math.max(seq, command.seq)
        if (command.at > at) at = command.at
      }
      const row = { battleId, seq, at }
      if (recent.length === 500 && (row.at < recent[499]!.at || (row.at === recent[499]!.at && row.battleId >= recent[499]!.battleId)))
        continue
      recent.push(row)
      recent.sort((a, b) => Number(b.at - a.at) || a.battleId.localeCompare(b.battleId))
      if (recent.length > 500) recent.pop()
    }
    return recent.map(({ battleId, seq }) => ({ battleId, seq }))
  },
)

function battleData(ctx: Context, battleId: string) {
  const battle = ctx.db.battles.id.find(battleId)
  if (!battle) throw new SenderError('Battle unavailable')
  const seats = Array.from(ctx.db.battleUsers.battleId.filter(battleId)).sort(
    (left, right) => left.side - right.side || (left.joinedAt > right.joinedAt ? 1 : left.joinedAt < right.joinedAt ? -1 : 0),
  )
  const log = Array.from(ctx.db.commands.battleId.filter(battleId))
    .sort((left, right) => left.seq - right.seq)
    .flatMap((row): LoggedCommand[] => {
      const command = commandSchema.safeParse(JSON.parse(row.body))
      const metadata = (JSON.parse(row.body) as { $sync?: { operationId?: string } }).$sync
      return command.success
        ? [
            {
              seq: row.seq,
              by: row.userId,
              at: safeNumber(row.at),
              command: command.data,
              ...(metadata?.operationId ? { operationId: metadata.operationId } : {}),
            },
          ]
        : []
    })
  return {
    battle,
    seats: seats.map((seat) => ({
      id: seat.userId,
      side: seat.side,
      automated: Boolean(ctx.db.practiceOpponents.userId.find(seat.userId)),
    })),
    log,
  }
}

export const battleForOperator = spacetime.procedure({ battleId: t.string() }, t.string(), (ctx, { battleId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    return productJson(battleData(tx, battleId))
  }),
)

const newBattle = z.strictObject({
  id: z.string().min(1).max(128),
  token: z.string().min(1).max(128),
  userId: z.string().min(1).max(128),
  allyIds: z.array(z.string().min(1).max(128)).max(3),
  opponentIds: z.array(z.string().min(1).max(128)).min(1).max(3),
  initialCommands: z.array(commandSchema).max(1_000),
  now: z.number().int().nonnegative(),
})

export const createBattle = spacetime.procedure({ payload: t.string() }, t.string(), (ctx, { payload }) =>
  ctx.withTx((tx) => createBattleIn(tx, [payload])),
)

export const battleByToken = spacetime.procedure({ token: t.string() }, t.string(), (ctx, { token }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    const battle = tx.db.battles.token.find(token)
    return productJson(battle ? battleData(tx, battle.id) : null)
  }),
)

const battleFeedQuery = z.strictObject({
  scope: z.enum(['user', 'league', 'public', 'friends', 'watchable', 'profile']),
  userId: z.string().max(128).nullable(),
  viewerId: z.string().max(128).nullable(),
  withUserId: z.string().max(128).nullable(),
  leagueToken: z.string().max(128).nullable(),
  eventToken: z.string().max(128).nullable(),
  since: z.number().int().nonnegative().nullable(),
  before: z.strictObject({ at: z.number().int().nonnegative(), id: z.string().max(128) }).nullable(),
  limit: z.number().int().min(1).max(500),
})

export const battleFeed = spacetime.procedure({ payload: t.string() }, t.string(), (ctx, { payload }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (payload.length > 2_000) throw new SenderError('Invalid battle feed')
    const parsed = battleFeedQuery.safeParse(JSON.parse(payload))
    if (!parsed.success) throw new SenderError('Invalid battle feed')
    const input = parsed.data
    if (
      ((input.scope === 'user' || input.scope === 'friends' || input.scope === 'profile') && !input.userId) ||
      (input.scope === 'league' && (!input.leagueToken || !input.eventToken)) ||
      (input.scope === 'watchable' && input.since === null)
    ) {
      throw new SenderError('Invalid battle feed scope')
    }

    const league = input.leagueToken ? tx.db.leagues.token.find(input.leagueToken) : undefined
    const event = input.eventToken ? tx.db.leagueEvents.token.find(input.eventToken) : undefined
    if (input.scope === 'league' && (!league || !event || event.leagueId !== league.id || event.revealedAt === undefined)) {
      return productJson({ battles: [], nextCursor: null })
    }
    const friendIds = new Set<string>()
    if (input.scope === 'friends') {
      for (const row of tx.db.friendships.requesterId.filter(input.userId!))
        if (row.acceptedAt !== undefined) friendIds.add(row.addresseeId)
      for (const row of tx.db.friendships.addresseeId.filter(input.userId!))
        if (row.acceptedAt !== undefined) friendIds.add(row.requesterId)
    }

    const rows: { id: string; token: string; createdAt: number; at: number }[] = []
    const candidates = function* () {
      if (input.scope === 'user' || input.scope === 'profile') {
        for (const seat of tx.db.battleUsers.userId.filter(input.userId!)) {
          const battle = tx.db.battles.id.find(seat.battleId)
          if (battle) yield battle
        }
      } else if (input.scope === 'league') {
        for (const entry of tx.db.leagueEventBattles.eventId.filter(event!.id)) {
          const battle = tx.db.battles.id.find(entry.battleId)
          if (battle) yield battle
        }
      } else yield* tx.db.battles.iter()
    }
    for (const battle of candidates()) {
      const seats = Array.from(tx.db.battleUsers.battleId.filter(battle.id))
      const seatIds = new Set(seats.map((seat) => seat.userId))
      const hasPractice = seats.some((seat) => Boolean(tx.db.practiceOpponents.userId.find(seat.userId)))
      const withheldPublic = seats.some((seat) => {
        const audience = tx.db.battleSharing.userId.find(seat.userId)?.audience ?? DEFAULT_BATTLE_AUDIENCE
        return audience !== 'public'
      })
      const withheldFriends = seats.some((seat) => tx.db.battleSharing.userId.find(seat.userId)?.audience === 'private')
      if (input.scope === 'user' && (!seatIds.has(input.userId!) || (input.withUserId && !seatIds.has(input.withUserId)))) continue
      if (input.scope === 'league' && tx.db.leagueEventBattles.battleId.find(battle.id)?.eventId !== event!.id) continue
      if (input.scope === 'public' && (withheldPublic || hasPractice || (input.viewerId && seatIds.has(input.viewerId)))) continue
      if (
        input.scope === 'friends' &&
        (withheldFriends || hasPractice || seatIds.has(input.userId!) || !seats.some((seat) => friendIds.has(seat.userId)))
      )
        continue
      if (input.scope === 'watchable' && withheldPublic) continue
      if (
        input.scope === 'profile' &&
        (!seatIds.has(input.userId!) || (input.viewerId ? !seatIds.has(input.viewerId) && withheldFriends : withheldPublic))
      ) {
        continue
      }
      let activity = battle.createdAt
      if (input.scope === 'user' || input.scope === 'league' || input.scope === 'watchable' || input.scope === 'profile') {
        for (const command of tx.db.commands.battleId.filter(battle.id)) if (command.at > activity) activity = command.at
      }
      const at = safeNumber(activity)
      if (input.scope === 'watchable' && at < input.since!) continue
      if (input.before && (at > input.before.at || (at === input.before.at && battle.id >= input.before.id))) continue
      const row = { id: battle.id, token: battle.token, createdAt: safeNumber(battle.createdAt), at }
      const last = rows.at(-1)
      if (rows.length === input.limit + 1 && last && (row.at < last.at || (row.at === last.at && row.id <= last.id))) continue
      rows.push(row)
      rows.sort((left, right) => right.at - left.at || right.id.localeCompare(left.id))
      if (rows.length > input.limit + 1) rows.pop()
    }
    const shown = rows.slice(0, input.limit)
    const last = shown.at(-1)
    return productJson({
      battles: shown.map((row) => ({ ...battleData(tx, row.id), at: row.at })),
      nextCursor: rows.length > input.limit && last ? { at: last.at, id: last.id } : null,
    })
  }),
)

export const removeBattle = spacetime.procedure({ battleId: t.string(), userId: t.string() }, t.bool(), (ctx, input) =>
  ctx.withTx((tx) => removeBattleIn(tx, [input.battleId, input.userId])),
)

export const deleteBattleForOperator = spacetime.procedure({ battleId: t.string() }, t.bool(), (ctx, { battleId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (!tx.db.battles.id.find(battleId)) return false
    deleteBattle(tx, battleId)
    return true
  }),
)

export const submitBattle = spacetime.procedure(
  { battleId: t.string(), userId: t.string(), expectedSeq: t.u32(), body: t.string(), now: t.u64(), externalRefusal: t.string() },
  t.string(),
  (ctx, input) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      if (input.body.length > 1_000_000) throw new SenderError('Battle command is too large')
      const raw = JSON.parse(input.body) as Record<string, unknown>
      const sync = z
        .object({ operationId: z.uuid(), fingerprint: z.string().length(64), at: z.number().int().nonnegative() })
        .optional()
        .parse(raw.$sync)
      const parsed = commandSchema.safeParse(raw)
      if (!parsed.success) throw new SenderError('Invalid battle command')
      const { seats, log } = battleData(tx, input.battleId)
      const state = reduceBattle(
        seats.map((seat) => seat.id),
        log,
        seats.map((seat) => seat.side),
        seats.filter((seat) => seat.automated).map((seat) => seat.id),
      )
      if (sync) {
        const previous = log.find((entry) => entry.operationId === sync.operationId)
        if (previous) {
          const stored = tx.db.commands.key.find(JSON.stringify([input.battleId, previous.seq]))!
          const metadata = (JSON.parse(stored.body) as { $sync: { fingerprint: string } }).$sync
          if (previous.by !== input.userId || metadata.fingerprint !== sync.fingerprint)
            throw new SenderError('Operation ID reused for a different action')
          return productJson({ result: { outcome: 'appended', seq: previous.seq }, log })
        }
      }
      if (input.expectedSeq !== state.seq) return productJson({ result: { outcome: 'stale', seq: state.seq }, log })
      const refusal = validate(state, input.userId, parsed.data)
      if (refusal) return productJson({ result: { outcome: 'refused', reason: refusal }, log })
      if (input.externalRefusal) {
        if (input.externalRefusal.length > 1_000) throw new SenderError('Invalid battle refusal')
        return productJson({ result: { outcome: 'refused', reason: input.externalRefusal }, log })
      }
      const seq = state.seq + 1
      tx.db.commands.insert({
        key: JSON.stringify([input.battleId, seq]),
        battleId: input.battleId,
        seq,
        userId: input.userId,
        at: sync ? BigInt(Math.max(log.at(-1)?.at ?? 0, Math.min(sync.at, safeNumber(input.now)))) : input.now,
        body: JSON.stringify({ ...parsed.data, ...(sync ? { $sync: sync } : {}) }),
      })
      for (const seat of seats) touchProduct(tx, seat.id, 'battles')
      touchPublic(tx, 'battles')
      if (state.status === 'finished' || parsed.data.kind === 'end-battle') touchPublic(tx, 'standings')
      return productJson({
        result: { outcome: 'appended', seq },
        log: [
          ...log,
          {
            seq,
            by: input.userId,
            at: sync ? Math.max(log.at(-1)?.at ?? 0, Math.min(sync.at, safeNumber(input.now))) : safeNumber(input.now),
            command: parsed.data,
            ...(sync ? { operationId: sync.operationId } : {}),
          },
        ],
      })
    }),
)

function friendshipKey(requesterId: string, addresseeId: string) {
  if (!requesterId || !addresseeId || requesterId === addresseeId || requesterId.length > 128 || addresseeId.length > 128) {
    throw new SenderError('Invalid friendship')
  }
  return JSON.stringify([requesterId, addresseeId])
}

function friendshipBetween(ctx: Context, leftId: string, rightId: string) {
  return ctx.db.friendships.key.find(friendshipKey(leftId, rightId)) ?? ctx.db.friendships.key.find(friendshipKey(rightId, leftId))
}

export const friendshipsByUser = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (!userId || userId.length > 128) throw new SenderError('Invalid user ID')
    const rows = [...Array.from(tx.db.friendships.requesterId.filter(userId)), ...Array.from(tx.db.friendships.addresseeId.filter(userId))]
    if (rows.length > 1_000) throw new SenderError('Too many friendships')
    return productJson(
      rows.map(({ requesterId, addresseeId, acceptedAt }) => ({ requesterId, addresseeId, acceptedAt: acceptedAt ?? null })),
    )
  }),
)

export const productStats = spacetime.procedure({ userIds: t.array(t.string()) }, t.string(), (ctx, { userIds }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (userIds.length > 100 || userIds.some((id) => !id || id.length > 128)) throw new SenderError('Invalid product stats query')
    return productJson(
      [...new Set(userIds)].map((userId) => ({
        userId,
        rosterCount: Array.from(tx.db.rosters.userId.filter(userId)).length,
        battleCount: Array.from(tx.db.battleUsers.userId.filter(userId)).length,
        leagueCount: Array.from(tx.db.leagues.ownerId.filter(userId)).length,
        friendCount: [...tx.db.friendships.requesterId.filter(userId), ...tx.db.friendships.addresseeId.filter(userId)].filter(
          (row) => row.acceptedAt !== undefined,
        ).length,
        practiceOpponent: Boolean(tx.db.practiceOpponents.userId.find(userId)),
      })),
    )
  }),
)

export const practiceOpponentIds = spacetime.procedure({}, t.string(), (ctx) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    const ids = Array.from(tx.db.practiceOpponents.iter(), (row) => row.userId)
    if (ids.length > 100) throw new SenderError('Too many practice opponents')
    return productJson(ids.sort())
  }),
)

export const registerPracticeOpponent = spacetime.reducer({ userId: t.string() }, (ctx, { userId }) => {
  requireOperator(ctx)
  if (!userId || userId.length > 128) throw new SenderError('Invalid user ID')
  if (ctx.db.practiceOpponents.userId.find(userId)) return
  if (Array.from(ctx.db.practiceOpponents.iter()).length >= 100) throw new SenderError('Too many practice opponents')
  ctx.db.practiceOpponents.insert({ userId })
  touchPublic(ctx, 'opponents')
  touchAdmin(ctx)
})

export const requestFriend = spacetime.procedure(
  { requesterId: t.string(), addresseeId: t.string(), now: t.u64() },
  t.bool(),
  (ctx, input) => ctx.withTx((tx) => requestFriendIn(tx, [input.requesterId, input.addresseeId, input.now])),
)

export const acceptFriend = spacetime.procedure(
  { requesterId: t.string(), addresseeId: t.string(), now: t.u64() },
  t.bool(),
  (ctx, input) => ctx.withTx((tx) => acceptFriendIn(tx, [input.requesterId, input.addresseeId, input.now])),
)

export const rejectFriend = spacetime.procedure({ requesterId: t.string(), addresseeId: t.string() }, t.bool(), (ctx, input) =>
  ctx.withTx((tx) => rejectFriendIn(tx, [input.requesterId, input.addresseeId])),
)

export const removeFriend = spacetime.procedure({ leftId: t.string(), rightId: t.string() }, t.bool(), (ctx, input) =>
  ctx.withTx((tx) => removeFriendIn(tx, [input.leftId, input.rightId])),
)

export const friendInviteByInviter = spacetime.procedure({ inviterId: t.string() }, t.string(), (ctx, { inviterId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    return productJson(tx.db.friendInvites.inviterId.find(inviterId)?.token ?? null)
  }),
)

export const friendInviteByToken = spacetime.procedure({ token: t.string() }, t.string(), (ctx, { token }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    const invite = tx.db.friendInvites.token.find(token)
    return productJson(invite ? { token: invite.token, inviterId: invite.inviterId } : null)
  }),
)

export const replaceFriendInvite = spacetime.reducer({ inviterId: t.string(), token: t.string(), now: t.u64() }, (ctx, input) => {
  replaceFriendInviteIn(ctx, [input.inviterId, input.token, input.now])
})

export const cancelFriendInvite = spacetime.procedure({ inviterId: t.string() }, t.bool(), (ctx, { inviterId }) =>
  ctx.withTx((tx) => cancelFriendInviteIn(tx, [inviterId])),
)

export const acceptFriendInvite = spacetime.procedure(
  { token: t.string(), recipientId: t.string(), now: t.u64() },
  t.string(),
  (ctx, input) => ctx.withTx((tx) => acceptFriendInviteIn(tx, [input.token, input.recipientId, input.now])),
)

export const battleAudiences = spacetime.procedure({ userIds: t.array(t.string()) }, t.string(), (ctx, { userIds }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (userIds.length > 1_000) throw new SenderError('Too many audience recipients')
    return productJson(
      [...new Set(userIds)].map((userId) => ({
        userId,
        audience: tx.db.battleSharing.userId.find(userId)?.audience ?? DEFAULT_BATTLE_AUDIENCE,
      })),
    )
  }),
)

export const setBattleAudience = spacetime.procedure({ userId: t.string(), audience: t.string(), now: t.u64() }, t.string(), (ctx, input) =>
  ctx.withTx((tx) => setBattleAudienceIn(tx, [input.userId, input.audience, input.now])),
)

export const shareBattle = spacetime.procedure({ userId: t.string(), otherId: t.string() }, t.bool(), (ctx, input) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    for (const seat of tx.db.battleUsers.userId.filter(input.userId)) {
      if (tx.db.battleUsers.key.find(JSON.stringify([seat.battleId, input.otherId]))) return true
    }
    return false
  }),
)

function onboardingData(ctx: Context, userId: string) {
  if (!userId || userId.length > 128) throw new SenderError('Invalid user ID')
  const tasks = Array.from(ctx.db.userOnboardingTasks.userId.filter(userId)).map(({ task, state }) => ({ task, state }))
  if (tasks.length > 100) throw new SenderError('Too many onboarding tasks')
  const roster = Array.from(ctx.db.rosters.userId.filter(userId)).some((row) => row.picks !== '[]')
  const friend = [...ctx.db.friendships.requesterId.filter(userId), ...ctx.db.friendships.addresseeId.filter(userId)].some(
    (row) => row.acceptedAt !== undefined,
  )
  return {
    welcomed: ctx.db.userOnboarding.userId.find(userId)?.welcomed ?? false,
    tasks,
    facts: {
      roster,
      friend,
      battle: Boolean(ctx.db.battleUsers.userId.filter(userId).next().value),
      league: Boolean(ctx.db.leagues.ownerId.filter(userId).next().value || ctx.db.leagueEventEntries.userId.filter(userId).next().value),
    },
  }
}

export const onboardingByUser = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    return productJson(onboardingData(tx, userId))
  }),
)

export const updateOnboarding = spacetime.procedure(
  { userId: t.string(), operation: t.string(), task: t.string() },
  t.string(),
  (ctx, input) => ctx.withTx((tx) => updateOnboardingIn(tx, [input.userId, input.operation, input.task])),
)

function safeNumber(value: bigint) {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) throw new Error('Product timestamp is outside the supported range')
  return number
}

function productJson(value: unknown) {
  return JSON.stringify(value, (_key, field: unknown) => {
    if (typeof field !== 'bigint') return field === undefined ? null : field
    return safeNumber(field)
  })
}

function parseRoster(payload: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    throw new SenderError('Invalid roster')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new SenderError('Invalid roster')
  const row = parsed as Record<string, unknown>
  const string = (name: string, max: number, min = 0) => {
    const value = row[name]
    if (typeof value !== 'string' || value.length < min || value.length > max) throw new SenderError('Invalid roster')
    return value
  }
  const nullable = (name: string, max: number) => (row[name] === null ? null : string(name, max))
  const limit = row.limit
  const now = row.now
  const visibility = string('visibility', 8)
  const source = string('source', 16)
  if (
    typeof limit !== 'number' ||
    !Number.isInteger(limit) ||
    limit < 0 ||
    limit > 10_000 ||
    typeof now !== 'number' ||
    !Number.isSafeInteger(now) ||
    now < 0 ||
    !(ROSTER_VISIBILITIES as readonly string[]).includes(visibility) ||
    !(ROSTER_SOURCES as readonly string[]).includes(source)
  ) {
    throw new SenderError('Invalid roster')
  }
  return {
    id: string('id', 128, 1),
    userId: string('userId', 128, 1),
    name: string('name', 80),
    automaticName: row.automaticName === true,
    catalogueId: string('catalogueId', 128, 1),
    detachmentId: nullable('detachmentId', 1_000),
    disposition: nullable('disposition', 128),
    limit,
    picks: string('picks', 1_000_000),
    prep: nullable('prep', 100_000),
    tags: string('tags', 10_000),
    waivedRules: string('waivedRules', 10_000),
    optionalRules: string('optionalRules', 10_000),
    borrowedDetachmentId: nullable('borrowedDetachmentId', 128),
    baseRosterId: row.baseRosterId === undefined ? null : nullable('baseRosterId', 128),
    visibility,
    source,
    now,
  }
}

export const rosterById = spacetime.procedure({ id: t.string() }, t.string(), (ctx, { id }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (!id || id.length > 128) throw new SenderError('Invalid roster ID')
    return productJson(tx.db.rosters.id.find(id) ?? null)
  }),
)

export const rostersByUser = spacetime.procedure(
  { userId: t.string(), publicOnly: t.bool(), limit: t.u32() },
  t.string(),
  (ctx, { userId, publicOnly, limit }) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      if (!userId || userId.length > 128 || limit < 1 || limit > 1_000) throw new SenderError('Invalid roster query')
      const rows = Array.from(tx.db.rosters.userId.filter(userId))
        .filter((row) => !publicOnly || row.visibility === 'public')
        .sort((left, right) => (right.createdAt > left.createdAt ? 1 : right.createdAt < left.createdAt ? -1 : 0))
      if (!publicOnly && rows.length > limit) throw new SenderError('Roster list exceeds the supported limit')
      return productJson(rows.slice(0, limit))
    }),
)

export const rosterSummariesByUser = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (!userId || userId.length > 128) throw new SenderError('Invalid roster query')
    const rows = Array.from(tx.db.rosters.userId.filter(userId))
    if (rows.length > 1_000) throw new SenderError('Roster list exceeds the supported limit')
    rows.sort((left, right) => (right.createdAt > left.createdAt ? 1 : right.createdAt < left.createdAt ? -1 : 0))
    return productJson(
      rows.map((row) => {
        const picks = JSON.parse(row.picks) as { attachedTo?: number }[]
        return {
          id: row.id,
          name: row.name,
          automaticName: row.automaticName,
          catalogueId: row.catalogueId,
          detachmentId: row.detachmentId,
          disposition: row.disposition,
          limit: row.limit,
          waivedRules: row.waivedRules,
          optionalRules: row.optionalRules,
          borrowedDetachmentId: row.borrowedDetachmentId,
          baseRosterId: row.baseRosterId,
          visibility: row.visibility,
          source: row.source,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          unitCount: attachedUnitCount(picks.map((pick, key) => ({ key, attachedTo: pick.attachedTo }))),
        }
      }),
    )
  }),
)

export const rosterGroupByUser = spacetime.procedure(
  { userId: t.string(), baseRosterId: t.string() },
  t.string(),
  (ctx, { userId, baseRosterId }) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      if (!userId || userId.length > 128 || !baseRosterId || baseRosterId.length > 128) throw new SenderError('Invalid roster query')
      const rows = Array.from(tx.db.rosters.userId.filter(userId))
      if (rows.length > 1_000) throw new SenderError('Roster list exceeds the supported limit')
      return productJson(
        rows
          .filter((row) => (row.baseRosterId ?? row.id) === baseRosterId)
          .sort(
            (left, right) =>
              Number(right.id === baseRosterId) - Number(left.id === baseRosterId) ||
              (left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : left.id.localeCompare(right.id)),
          )
          .map(({ id, name, automaticName }) => ({ id, name, automaticName })),
      )
    }),
)

export const rostersByIds = spacetime.procedure({ userId: t.string(), ids: t.array(t.string()) }, t.string(), (ctx, { userId, ids }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (
      !userId ||
      userId.length > 128 ||
      !ids.length ||
      ids.length > ROSTER_LIBRARY_BATCH_SIZE ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !id || id.length > 128)
    )
      throw new SenderError('Invalid roster query')
    return productJson(
      ids.flatMap((id) => {
        const row = tx.db.rosters.id.find(id)
        return row?.userId === userId ? [row] : []
      }),
    )
  }),
)

export const homeRostersByUser = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (!userId || userId.length > 128) throw new SenderError('Invalid roster query')
    const rows: NonNullable<ReturnType<typeof tx.db.rosters.id.find>>[] = []
    let count = 0
    const compare = (left: (typeof rows)[number], right: (typeof rows)[number]) => {
      if (left.updatedAt !== right.updatedAt) return left.updatedAt > right.updatedAt ? -1 : 1
      return left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
    }
    for (const row of tx.db.rosters.userId.filter(userId)) {
      if (++count > 1_000) throw new SenderError('Roster list exceeds the supported limit')
      rows.push(row)
      rows.sort(compare)
      if (rows.length > 5) rows.pop()
    }
    return productJson({ count, rows })
  }),
)

function saveRosterIn(tx: Context, input: ReturnType<typeof parseRoster>) {
  const current = tx.db.rosters.id.find(input.id)
  if (current?.userId !== undefined && current.userId !== input.userId) return 'forbidden'
  const fields = {
    name: input.name,
    automaticName: input.automaticName,
    catalogueId: input.catalogueId,
    detachmentId: input.detachmentId ?? undefined,
    disposition: input.disposition ?? undefined,
    limit: input.limit,
    picks: input.picks,
    prep: input.prep ?? undefined,
    tags: input.tags,
    waivedRules: input.waivedRules,
    optionalRules: input.optionalRules,
    borrowedDetachmentId: input.borrowedDetachmentId ?? undefined,
    visibility: input.visibility,
    source: input.source,
    updatedAt: current && current.updatedAt >= BigInt(input.now) ? current.updatedAt + 1n : BigInt(input.now),
  }
  if (current) {
    tx.db.rosters.id.update({ ...current, ...fields })
    touchProduct(tx, input.userId, 'rosters', 'onboarding')
    if (current.visibility !== 'private' || input.visibility !== 'private') touchPublic(tx, 'rosters')
    return 'updated'
  }
  // A variant joins its base's group, so variants of variants stay one flat group.
  const base = input.baseRosterId ? tx.db.rosters.id.find(input.baseRosterId) : null
  if (input.baseRosterId && base?.userId !== input.userId) return 'forbidden'
  const baseRosterId = base ? (base.baseRosterId ?? base.id) : undefined
  tx.db.rosters.insert({ id: input.id, userId: input.userId, createdAt: BigInt(input.now), baseRosterId, ...fields })
  touchProduct(tx, input.userId, 'rosters', 'onboarding')
  if (input.visibility !== 'private') touchPublic(tx, 'rosters')
  touchAdmin(tx)
  return 'inserted'
}

export const saveRoster = spacetime.procedure({ payload: t.string() }, t.string(), (ctx, { payload }) => {
  if (payload.length > 1_200_000) throw new SenderError('Roster is too large')
  const input = parseRoster(payload)
  return ctx.withTx((tx) => {
    requireOperator(tx)
    return saveRosterIn(tx, input)
  })
})

export const syncRoster = spacetime.procedure({ payload: t.string() }, t.string(), (ctx, { payload }) => {
  if (payload.length > 1_250_000) throw new SenderError('Roster is too large')
  const parsed = z
    .object({
      row: z.string().max(1_200_000),
      operationId: z.uuid(),
      fingerprint: z.string().length(64),
      expectedVersion: z.number().int().nonnegative().nullable(),
      deleted: z.boolean(),
    })
    .parse(JSON.parse(payload))
  const input = parseRoster(parsed.row)
  return ctx.withTx((tx) => {
    requireOperator(tx)
    const current = tx.db.rosters.id.find(input.id)
    const receipt = tx.db.rosterSync.id.find(input.id)
    if ((current && current.userId !== input.userId) || (receipt && receipt.userId !== input.userId))
      return productJson({ outcome: 'refused', message: 'You do not own this roster.' })
    if (receipt?.operationId === parsed.operationId) {
      if (receipt.fingerprint !== parsed.fingerprint) throw new SenderError('Operation ID reused for a different edit')
      return productJson({ outcome: 'applied', version: safeNumber(receipt.version), deleted: receipt.deleted })
    }
    if ((current ? safeNumber(current.updatedAt) : null) !== parsed.expectedVersion || (!current && receipt))
      return productJson({
        outcome: 'conflict',
        message: current ? 'This roster changed on another device.' : 'This roster was deleted on another device.',
      })
    if (parsed.deleted) {
      if (current) {
        tx.db.rosters.id.delete(input.id)
        touchProduct(tx, input.userId, 'rosters', 'onboarding')
        if (current.visibility !== 'private') touchPublic(tx, 'rosters')
        touchAdmin(tx)
      }
    } else if (saveRosterIn(tx, input) === 'forbidden') return productJson({ outcome: 'refused', message: 'You do not own this roster.' })
    const version = parsed.deleted ? BigInt(input.now) : tx.db.rosters.id.find(input.id)!.updatedAt
    const next = {
      id: input.id,
      userId: input.userId,
      operationId: parsed.operationId,
      fingerprint: parsed.fingerprint,
      version,
      deleted: parsed.deleted,
    }
    if (receipt) tx.db.rosterSync.id.update(next)
    else tx.db.rosterSync.insert(next)
    return productJson({ outcome: 'applied', version: safeNumber(version), deleted: parsed.deleted })
  })
})

export const setRosterVisibility = spacetime.procedure(
  { id: t.string(), userId: t.string(), visibility: t.string(), now: t.u64() },
  t.bool(),
  (ctx, { id, userId, visibility, now }) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      if (!(ROSTER_VISIBILITIES as readonly string[]).includes(visibility)) throw new SenderError('Invalid roster visibility')
      const current = tx.db.rosters.id.find(id)
      if (!current || current.userId !== userId) return false
      tx.db.rosters.id.update({ ...current, visibility, updatedAt: current.updatedAt >= now ? current.updatedAt + 1n : now })
      touchProduct(tx, userId, 'rosters')
      if (current.visibility !== 'private' || visibility !== 'private') touchPublic(tx, 'rosters')
      return true
    }),
)

export const deleteRoster = spacetime.reducer({ id: t.string(), userId: t.string() }, (ctx, { id, userId }) => {
  requireOperator(ctx)
  const current = ctx.db.rosters.id.find(id)
  if (current?.userId === userId) {
    ctx.db.rosters.id.delete(id)
    touchProduct(ctx, userId, 'rosters', 'onboarding')
    if (current.visibility !== 'private') touchPublic(ctx, 'rosters')
    touchAdmin(ctx)
  }
})

export const collectionByUser = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    return productJson(
      Array.from(tx.db.collection.userId.filter(userId)).map(({ userId: ownerId, entryId, at }) => ({ userId: ownerId, entryId, at })),
    )
  }),
)

export const addToCollection = spacetime.reducer({ userId: t.string(), entryId: t.string(), at: t.u64() }, (ctx, input) => {
  addToCollectionIn(ctx, [input.userId, input.entryId, input.at])
})

export const removeFromCollection = spacetime.reducer({ userId: t.string(), entryId: t.string() }, (ctx, input) => {
  removeFromCollectionIn(ctx, [input.userId, input.entryId])
})

export const favouriteFactionsByUser = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    return productJson(
      Array.from(tx.db.favouriteFactions.userId.filter(userId)).map(({ userId: ownerId, catalogueId, at }) => ({
        userId: ownerId,
        catalogueId,
        at,
      })),
    )
  }),
)

export const addFavouriteFaction = spacetime.reducer({ userId: t.string(), catalogueId: t.string(), at: t.u64() }, (ctx, input) => {
  addFavouriteFactionIn(ctx, [input.userId, input.catalogueId, input.at])
})

export const removeFavouriteFaction = spacetime.reducer({ userId: t.string(), catalogueId: t.string() }, (ctx, input) => {
  removeFavouriteFactionIn(ctx, [input.userId, input.catalogueId])
})

export const favouriteDetachmentsByUser = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    return productJson(
      Array.from(tx.db.favouriteDetachments.userId.filter(userId)).map(({ userId: ownerId, catalogueId, detachmentId, at }) => ({
        userId: ownerId,
        catalogueId,
        detachmentId,
        at,
      })),
    )
  }),
)

export const addFavouriteDetachment = spacetime.reducer(
  { userId: t.string(), catalogueId: t.string(), detachmentId: t.string(), at: t.u64() },
  (ctx, input) => {
    addFavouriteDetachmentIn(ctx, [input.userId, input.catalogueId, input.detachmentId, input.at])
  },
)

export const removeFavouriteDetachment = spacetime.reducer(
  { userId: t.string(), catalogueId: t.string(), detachmentId: t.string() },
  (ctx, input) => {
    removeFavouriteDetachmentIn(ctx, [input.userId, input.catalogueId, input.detachmentId])
  },
)

export const pushEnabled = spacetime.procedure({ userId: t.string() }, t.bool(), (ctx, { userId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    return tx.db.pushPreferences.userId.find(userId)?.enabled ?? DEFAULT_PUSH_NOTIFICATIONS
  }),
)

export const setPushEnabled = spacetime.procedure({ userId: t.string(), enabled: t.bool(), now: t.u64() }, t.bool(), (ctx, input) =>
  ctx.withTx((tx) => setPushEnabledIn(tx, [input.userId, input.enabled, input.now])),
)

export const playerDefaults = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    const row = tx.db.playerDefaults.userId.find(userId)
    return productJson(row ? { rosterVisibility: row.rosterVisibility, battleSize: row.battleSize } : DEFAULT_PLAYER_DEFAULTS)
  }),
)

export const setPlayerDefaults = spacetime.procedure(
  { userId: t.string(), rosterVisibility: t.string(), battleSize: t.u32(), now: t.u64() },
  t.string(),
  (ctx, input) => ctx.withTx((tx) => setPlayerDefaultsIn(tx, [input.userId, input.rosterVisibility, input.battleSize, input.now])),
)

export const registerPushToken = spacetime.reducer(
  { userId: t.string(), token: t.string(), platform: t.string(), now: t.u64() },
  (ctx, input) => {
    requireOperator(ctx)
    if (
      !input.userId ||
      input.userId.length > 128 ||
      !input.token ||
      input.token.length > 256 ||
      !(PUSH_PLATFORMS as readonly string[]).includes(input.platform)
    ) {
      throw new SenderError('Invalid push device')
    }
    const current = ctx.db.pushTokens.token.find(input.token)
    const row = {
      token: input.token,
      userId: input.userId,
      platform: input.platform,
      createdAt: current?.createdAt ?? input.now,
      lastSeenAt: input.now,
    }
    if (current) ctx.db.pushTokens.token.update(row)
    else ctx.db.pushTokens.insert(row)
    const devices = Array.from(ctx.db.pushTokens.userId.filter(input.userId)).sort(
      (left, right) =>
        (right.lastSeenAt > left.lastSeenAt ? 1 : right.lastSeenAt < left.lastSeenAt ? -1 : 0) || right.token.localeCompare(left.token),
    )
    for (const device of devices.slice(PUSH_TOKENS_PER_USER)) ctx.db.pushTokens.token.delete(device.token)
  },
)

export const unregisterPushToken = spacetime.reducer({ userId: t.string(), token: t.string() }, (ctx, input) => {
  requireOperator(ctx)
  const row = ctx.db.pushTokens.token.find(input.token)
  if (row?.userId === input.userId) ctx.db.pushTokens.token.delete(input.token)
})

export const deletePushTokens = spacetime.reducer({ tokens: t.array(t.string()) }, (ctx, { tokens }) => {
  requireOperator(ctx)
  if (tokens.length > 1_000) throw new SenderError('Too many push devices')
  for (const token of new Set(tokens)) ctx.db.pushTokens.token.delete(token)
})

export const pushTargets = spacetime.procedure({ userIds: t.array(t.string()) }, t.string(), (ctx, { userIds }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (userIds.length > 100) throw new SenderError('Too many notification recipients')
    const targets: { userId: string; token: string }[] = []
    for (const userId of new Set(userIds)) {
      if (tx.db.practiceOpponents.userId.find(userId)) continue
      for (const device of tx.db.pushTokens.userId.filter(userId)) targets.push({ userId, token: device.token })
    }
    return productJson(targets)
  }),
)

export const leagueNames = spacetime.procedure({ tokens: t.array(t.string()) }, t.string(), (ctx, { tokens }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (tokens.length > 100) throw new SenderError('Too many league names')
    return productJson(
      [...new Set(tokens)].flatMap((token) => {
        const league = tx.db.leagues.token.find(token)
        return league ? [[league.token, league.name]] : []
      }),
    )
  }),
)

export const operatorHealth = spacetime.procedure({}, t.bool(), (ctx) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    return true
  }),
)

export const publicStandingsRevision = spacetime.procedure({}, t.string(), (ctx) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    return (tx.db.publicRevisions.scope.find('standings')?.revision ?? 0n).toString()
  }),
)

function leagueEventsFor(ctx: Context, leagueId: string) {
  return Array.from(ctx.db.leagueEvents.leagueId.filter(leagueId)).sort((a, b) => b.number - a.number)
}

function leagueEntriesFor(ctx: Context, eventId: string) {
  return Array.from(ctx.db.leagueEventEntries.eventId.filter(eventId)).sort((a, b) =>
    a.joinedAt < b.joinedAt ? -1 : a.joinedAt > b.joinedAt ? 1 : a.userId.localeCompare(b.userId),
  )
}

function leagueEventFor(ctx: Context, leagueId: string, token: string | null) {
  const events = leagueEventsFor(ctx, leagueId)
  return token ? events.find((event) => event.token === token) : events[0]
}

function leagueRecord(ctx: Context, token: string, eventToken: string | null) {
  const league = ctx.db.leagues.token.find(token)
  if (!league) return null
  const events = leagueEventsFor(ctx, league.id)
  const selected = eventToken ? events.find((event) => event.token === eventToken) : events[0]
  if (!selected) return null
  const latest = events[0]!
  const entries = leagueEntriesFor(ctx, selected.id)
  const latestEntries = latest.id === selected.id ? entries : leagueEntriesFor(ctx, latest.id)
  return {
    league,
    selected,
    latest,
    events: events.slice(0, 100),
    eventCount: events.length,
    entries,
    latestEntryCount: latestEntries.length,
    latestAcceptedCount: latestEntries.filter((entry) => entry.status === 'accepted').length,
  }
}

export const leagueByToken = spacetime.procedure({ token: t.string(), eventToken: t.string() }, t.string(), (ctx, { token, eventToken }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (token.length > 128 || eventToken.length > 128) throw new SenderError('Invalid league token')
    return productJson(leagueRecord(tx, token, eventToken || null))
  }),
)

export const leaguesVisibleTo = spacetime.procedure({ userId: t.string(), limit: t.u32() }, t.string(), (ctx, { userId, limit }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (userId.length > 128 || limit < 1 || limit > 100) throw new SenderError('Invalid league list')
    const personal = new Set<string>()
    if (userId) {
      for (const row of tx.db.leagues.ownerId.filter(userId)) personal.add(row.id)
      for (const entry of tx.db.leagueEventEntries.userId.filter(userId)) {
        const event = tx.db.leagueEvents.id.find(entry.eventId)
        if (event) personal.add(event.leagueId)
      }
    }
    const leagues = []
    let scanned = 0
    for (const league of tx.db.leagues.iter()) {
      if (++scanned > 100_000) throw new SenderError('League list is too large')
      if (league.visibility === 'public' || personal.has(league.id)) leagues.push(league)
    }
    leagues.sort((a, b) => Number(personal.has(b.id)) - Number(personal.has(a.id)) || Number(b.createdAt - a.createdAt))
    return productJson(
      leagues.slice(0, limit).flatMap((league) => {
        const event = leagueEventFor(tx, league.id, null)
        if (!event) return []
        const entries = leagueEntriesFor(tx, event.id)
        return [
          {
            league,
            event,
            personal: personal.has(league.id),
            joined: entries.length,
            accepted: entries.filter((entry) => entry.status === 'accepted').length,
            occupied: entries.filter((entry) => entry.status !== 'rejected').length,
            ownEntry: entries.find((entry) => entry.userId === userId) ?? null,
          },
        ]
      }),
    )
  }),
)

export const outdatedLeagueEntriesForRoster = spacetime.procedure(
  { userId: t.string(), rosterId: t.string() },
  t.string(),
  (ctx, { userId, rosterId }) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      if (!userId || userId.length > 128 || !rosterId || rosterId.length > 128) throw new SenderError('Invalid roster lookup')
      const saved = tx.db.rosters.id.find(rosterId)
      if (!saved || saved.userId !== userId) return productJson([])
      const prep = saved.prep ? (JSON.parse(saved.prep) as { reminders?: unknown; remindersEnabled?: boolean }) : null
      const current = {
        name: saved.name,
        catalogueId: saved.catalogueId,
        detachmentIds: saved.detachmentId
          ? saved.detachmentId.startsWith('[')
            ? (JSON.parse(saved.detachmentId) as string[])
            : [saved.detachmentId]
          : [],
        disposition: saved.disposition ?? null,
        limit: saved.limit,
        picks: rosterPickSchema.array().parse(JSON.parse(saved.picks)),
        waivedRules: JSON.parse(saved.waivedRules) as FormatRuleId[],
        reminders: rosterReminderSchema.array().parse(prep?.reminders ?? []),
        remindersEnabled: prep?.remindersEnabled ?? true,
      }
      const matches = []
      let scanned = 0
      for (const entry of tx.db.leagueEventEntries.userId.filter(userId)) {
        if (++scanned > 1_000) throw new SenderError('Too many league entries')
        if (entry.rosterId !== rosterId || entry.status !== 'accepted' || entry.rosterSnapshot === undefined) continue
        const event = tx.db.leagueEvents.id.find(entry.eventId)
        if (!event || event.revealedAt !== undefined) continue
        let sameRoster = false
        try {
          sameRoster = matchesSealedLeagueRoster(current, parseRosterSnapshot(entry.rosterSnapshot))
        } catch {
          // An unreadable snapshot cannot be considered current.
        }
        if (sameRoster) continue
        const league = tx.db.leagues.id.find(event.leagueId)
        if (!league) continue
        matches.push({
          leagueToken: league.token,
          leagueName: league.name,
          eventToken: event.token,
          eventNumber: event.number,
        })
      }
      return productJson(matches)
    }),
)

export const leagueBattleCandidates = spacetime.procedure(
  { userId: t.string(), participantIds: t.array(t.string()) },
  t.string(),
  (ctx, { userId, participantIds }) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      if (
        !userId ||
        userId.length > 128 ||
        participantIds.length < 2 ||
        participantIds.length > 4 ||
        new Set(participantIds).size !== participantIds.length
      )
        throw new SenderError('Invalid league participants')
      const candidates = []
      for (const own of tx.db.leagueEventEntries.userId.filter(userId)) {
        if (candidates.length >= 1_000) throw new SenderError('Too many league candidates')
        if (own.status !== 'accepted' || own.rosterSnapshot === undefined) continue
        const event = tx.db.leagueEvents.id.find(own.eventId)
        if (!event || event.revealedAt === undefined) continue
        const league = tx.db.leagues.id.find(event.leagueId)
        if (!league) continue
        const participants = leagueEntriesFor(tx, event.id).filter(
          (entry) => participantIds.includes(entry.userId) && entry.status === 'accepted' && entry.rosterSnapshot !== undefined,
        )
        if (participants.length !== participantIds.length) continue
        candidates.push({ league, event, entries: participants })
      }
      candidates.sort((a, b) => Number(b.event.revealedAt! - a.event.revealedAt!) || b.event.number - a.event.number)
      return productJson(candidates.slice(0, 50))
    }),
)

export const leagueRosters = spacetime.procedure(
  { token: t.string(), userId: t.string(), eventToken: t.string(), readerId: t.string() },
  t.string(),
  (ctx, { token, userId, eventToken, readerId }) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      const league = tx.db.leagues.token.find(token)
      if (!league) return '[]'
      return productJson(
        leagueEventsFor(tx, league.id)
          .filter((event) => !eventToken || event.token === eventToken)
          .flatMap((event) => {
            const entry = tx.db.leagueEventEntries.key.find(JSON.stringify([event.id, userId]))
            if (!entry || entry.status !== 'accepted' || entry.rosterSnapshot === undefined) return []
            const reader = readerId ? tx.db.leagueEventEntries.key.find(JSON.stringify([event.id, readerId])) : undefined
            return [{ event, entry, reader: reader ?? null }]
          })
          .slice(0, 20),
      )
    }),
)

type LeagueEntryRow = NonNullable<ReturnType<Context['db']['leagueEventEntries']['key']['find']>>

/** Accepts waiting requests in `leagueEntriesFor` order, oldest first, until the event's places run out, returning who got in. */
function admitWaiting(ctx: Context, entries: LeagueEntryRow[], playerLimit: number | null, include: (entry: LeagueEntryRow) => boolean) {
  const accepted = entries.filter((entry) => entry.status === 'accepted').length
  const waiting = entries.filter((entry) => entry.status === 'pending' && include(entry))
  const places = playerLimit === null ? waiting.length : Math.max(0, playerLimit - accepted)
  return waiting.slice(0, places).map((entry) => {
    ctx.db.leagueEventEntries.key.update({ ...entry, status: 'accepted' })
    return entry.userId
  })
}

function resetLeagueEntry(ctx: Context, entry: LeagueEntryRow) {
  ctx.db.leagueEventEntries.key.update({
    ...entry,
    rosterId: undefined,
    rosterName: undefined,
    rosterSnapshot: undefined,
    submittedAt: undefined,
  })
}

function insertLeagueEntry(ctx: Context, eventId: string, userId: string, status: 'accepted' | 'pending', now: number) {
  ctx.db.leagueEventEntries.insert({
    key: JSON.stringify([eventId, userId]),
    eventId,
    userId,
    status,
    joinedAt: BigInt(now),
    rosterId: undefined,
    rosterName: undefined,
    rosterSnapshot: undefined,
    submittedAt: undefined,
    requiredLimit: undefined,
    teamId: undefined,
  })
}

function leagueCommandInput<S extends z.ZodType>(inputSchema: S, value: unknown): z.output<S> {
  const parsed = inputSchema.safeParse(value)
  if (!parsed.success)
    throw new SenderError(
      `Invalid league command: ${parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join(', ')}`,
    )
  return parsed.data
}

const leagueTokenInput = z.string().min(1).max(128)
const leagueIdInput = z.string().min(1).max(128)
const leagueTimeInput = z.number().int().nonnegative()
const leagueFormatInput = z.enum(['1v1', '2v1', '2v2'])
const leagueRuleInput = z.object({ format: leagueFormatInput, rosterLimit: z.number().int().positive().max(10_000) })
const leagueDetailsInput = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2_000),
  visibility: z.enum(['public', 'private']),
  admission: z.enum(['automatic', 'approval']),
  playerLimit: z.number().int().min(2).max(128).nullable(),
})

export const leagueCommand = spacetime.procedure({ payload: t.string() }, t.string(), (ctx, { payload }) =>
  ctx.withTx((tx) => leagueCommandIn(tx, [payload])),
)

function createBattleIn(tx: Context, args: unknown[]) {
  const values = z.tuple([z.string().max(2_000_000)]).parse(args)
  const { payload } = { payload: values[0] }

  requireOperator(tx)
  if (payload.length > 2_000_000) throw new SenderError('Battle is too large')
  const input = newBattle.safeParse(JSON.parse(payload))
  if (!input.success) throw new SenderError('Invalid battle')
  const { id, token, userId, allyIds, opponentIds, initialCommands, now } = input.data
  const seats = [
    { id: userId, side: 0 },
    ...allyIds.map((seatId) => ({ id: seatId, side: 0 })),
    ...opponentIds.map((seatId) => ({ id: seatId, side: 1 })),
  ]
  if (seats.length > 4 || new Set(seats.map((seat) => seat.id)).size !== seats.length) throw new SenderError('Invalid battle seats')
  tx.db.battles.insert({ id, token, createdAt: BigInt(now) })
  for (const [index, seat] of seats.entries()) {
    tx.db.battleUsers.insert({
      key: JSON.stringify([id, seat.id]),
      battleId: id,
      userId: seat.id,
      side: seat.side,
      joinedAt: BigInt(now + index),
    })
    touchProduct(tx, seat.id, 'battles', 'onboarding')
  }
  touchPublic(tx, 'battles')
  touchAdmin(tx)
  const log: LoggedCommand[] = []
  for (const [index, command] of initialCommands.entries()) {
    const state = reduceBattle(
      seats.map((seat) => seat.id),
      log,
      seats.map((seat) => seat.side),
    )
    const refusal = validate(state, userId, command)
    if (refusal) throw new SenderError(`new battle command was refused: ${refusal}`)
    const seq = index + 1
    tx.db.commands.insert({ key: JSON.stringify([id, seq]), battleId: id, seq, userId, at: BigInt(now), body: JSON.stringify(command) })
    log.push({ seq, by: userId, at: now, command })
  }
  return productJson(battleData(tx, id))
}

function removeBattleIn(tx: Context, args: unknown[]) {
  const values = z.tuple([z.string().max(2_000_000), z.string().max(2_000_000)]).parse(args)
  const input = { battleId: values[0], userId: values[1] }

  requireOperator(tx)
  const opener = Array.from(tx.db.battleUsers.battleId.filter(input.battleId))
    .filter((seat) => seat.side === 0)
    .sort((left, right) => (left.joinedAt > right.joinedAt ? 1 : left.joinedAt < right.joinedAt ? -1 : 0))[0]
  if (!opener || opener.userId !== input.userId) return false
  deleteBattle(tx, input.battleId)
  return true
}

function requestFriendIn(tx: Context, args: unknown[]) {
  const values = z
    .tuple([
      z.string().max(2_000_000),
      z.string().max(2_000_000),
      z.preprocess((value) => (typeof value === 'bigint' ? safeNumber(value) : value), z.number().int().nonnegative().transform(BigInt)),
    ])
    .parse(args)
  const input = { requesterId: values[0], addresseeId: values[1], now: values[2] }

  requireOperator(tx)
  const key = friendshipKey(input.requesterId, input.addresseeId)
  if (friendshipBetween(tx, input.requesterId, input.addresseeId)) return false
  tx.db.friendships.insert({
    key,
    requesterId: input.requesterId,
    addresseeId: input.addresseeId,
    requestedAt: input.now,
    acceptedAt: undefined,
  })
  touchFriends(tx, input.requesterId, input.addresseeId)
  return true
}

function acceptFriendIn(tx: Context, args: unknown[]) {
  const values = z
    .tuple([
      z.string().max(2_000_000),
      z.string().max(2_000_000),
      z.preprocess((value) => (typeof value === 'bigint' ? safeNumber(value) : value), z.number().int().nonnegative().transform(BigInt)),
    ])
    .parse(args)
  const input = { requesterId: values[0], addresseeId: values[1], now: values[2] }

  requireOperator(tx)
  const current = tx.db.friendships.key.find(friendshipKey(input.requesterId, input.addresseeId))
  if (!current || current.acceptedAt !== undefined) return false
  tx.db.friendships.key.update({ ...current, acceptedAt: input.now })
  touchFriends(tx, input.requesterId, input.addresseeId)
  return true
}

function rejectFriendIn(tx: Context, args: unknown[]) {
  const values = z.tuple([z.string().max(2_000_000), z.string().max(2_000_000)]).parse(args)
  const input = { requesterId: values[0], addresseeId: values[1] }

  requireOperator(tx)
  const current = tx.db.friendships.key.find(friendshipKey(input.requesterId, input.addresseeId))
  if (
    !current ||
    current.requesterId !== input.requesterId ||
    current.addresseeId !== input.addresseeId ||
    current.acceptedAt !== undefined
  )
    return false
  const deleted = tx.db.friendships.key.delete(current.key)
  if (deleted) touchFriends(tx, input.requesterId, input.addresseeId)
  return deleted
}

function removeFriendIn(tx: Context, args: unknown[]) {
  const values = z.tuple([z.string().max(2_000_000), z.string().max(2_000_000)]).parse(args)
  const input = { leftId: values[0], rightId: values[1] }

  requireOperator(tx)
  const current = friendshipBetween(tx, input.leftId, input.rightId)
  if (!current) return false
  const deleted = tx.db.friendships.key.delete(current.key)
  if (deleted) touchFriends(tx, current.requesterId, current.addresseeId)
  return deleted
}

function replaceFriendInviteIn(ctx: Context, args: unknown[]) {
  const values = z
    .tuple([
      z.string().max(2_000_000),
      z.string().max(2_000_000),
      z.preprocess((value) => (typeof value === 'bigint' ? safeNumber(value) : value), z.number().int().nonnegative().transform(BigInt)),
    ])
    .parse(args)
  const input = { inviterId: values[0], token: values[1], now: values[2] }

  requireOperator(ctx)
  if (!input.inviterId || input.inviterId.length > 128 || !input.token || input.token.length > 128) throw new SenderError('Invalid invite')
  const current = ctx.db.friendInvites.inviterId.find(input.inviterId)
  if (current) ctx.db.friendInvites.token.delete(current.token)
  ctx.db.friendInvites.insert({ inviterId: input.inviterId, token: input.token, createdAt: input.now })
  touchProduct(ctx, input.inviterId, 'invites')
  touchPublic(ctx, 'invites')
}

function cancelFriendInviteIn(tx: Context, args: unknown[]) {
  const values = z.tuple([z.string().max(2_000_000)]).parse(args)
  const { inviterId } = { inviterId: values[0] }

  requireOperator(tx)
  const current = tx.db.friendInvites.inviterId.find(inviterId)
  if (!current) return false
  const deleted = tx.db.friendInvites.token.delete(current.token)
  if (deleted) {
    touchProduct(tx, inviterId, 'invites')
    touchPublic(tx, 'invites')
  }
  return deleted
}

function acceptFriendInviteIn(tx: Context, args: unknown[]) {
  const values = z
    .tuple([
      z.string().max(2_000_000),
      z.string().max(2_000_000),
      z.preprocess((value) => (typeof value === 'bigint' ? safeNumber(value) : value), z.number().int().nonnegative().transform(BigInt)),
    ])
    .parse(args)
  const input = { token: values[0], recipientId: values[1], now: values[2] }

  requireOperator(tx)
  const invite = tx.db.friendInvites.token.find(input.token)
  if (!invite) return productJson('missing')
  if (invite.inviterId === input.recipientId) return productJson('self')
  const relationship = friendshipBetween(tx, invite.inviterId, input.recipientId)
  if (relationship?.acceptedAt !== undefined) return productJson('already-friends')
  if (relationship) tx.db.friendships.key.update({ ...relationship, acceptedAt: input.now })
  else {
    tx.db.friendships.insert({
      key: friendshipKey(invite.inviterId, input.recipientId),
      requesterId: invite.inviterId,
      addresseeId: input.recipientId,
      requestedAt: input.now,
      acceptedAt: input.now,
    })
  }
  tx.db.friendInvites.token.delete(input.token)
  touchFriends(tx, invite.inviterId, input.recipientId)
  touchProduct(tx, invite.inviterId, 'invites')
  touchPublic(tx, 'invites')
  return productJson({ inviterId: invite.inviterId })
}

function setBattleAudienceIn(tx: Context, args: unknown[]) {
  const values = z
    .tuple([
      z.string().max(2_000_000),
      z.string().max(2_000_000),
      z.preprocess((value) => (typeof value === 'bigint' ? safeNumber(value) : value), z.number().int().nonnegative().transform(BigInt)),
    ])
    .parse(args)
  const input = { userId: values[0], audience: values[1], now: values[2] }

  requireOperator(tx)
  if (!input.userId || input.userId.length > 128 || !(BATTLE_AUDIENCES as readonly string[]).includes(input.audience)) {
    throw new SenderError('Invalid battle audience')
  }
  const current = tx.db.battleSharing.userId.find(input.userId)
  const row = { userId: input.userId, audience: input.audience, at: input.now }
  if (current) tx.db.battleSharing.userId.update(row)
  else tx.db.battleSharing.insert(row)
  touchProduct(tx, input.userId, 'settings', 'battles')
  touchPublic(tx, 'battles')
  touchPublic(tx, 'standings')
  return input.audience
}

function updateOnboardingIn(tx: Context, args: unknown[]) {
  const values = z.tuple([z.string().max(2_000_000), z.string().max(2_000_000), z.string().max(2_000_000)]).parse(args)
  const input = { userId: values[0], operation: values[1], task: values[2] }

  requireOperator(tx)
  if (!input.userId || input.userId.length > 128) throw new SenderError('Invalid user ID')
  if (input.operation === 'welcome') {
    const current = tx.db.userOnboarding.userId.find(input.userId)
    if (current) tx.db.userOnboarding.userId.update({ ...current, welcomed: true })
    else tx.db.userOnboarding.insert({ userId: input.userId, welcomed: true })
  } else {
    if (!(onboardingTaskIds as readonly string[]).includes(input.task)) throw new SenderError('Invalid onboarding task')
    if (input.operation === 'complete' && !(tourTaskIds as readonly string[]).includes(input.task)) {
      throw new SenderError('Invalid onboarding completion')
    }
    const key = JSON.stringify([input.userId, input.task])
    const current = tx.db.userOnboardingTasks.key.find(key)
    if (input.operation === 'restore') {
      if (current?.state === 'skipped') tx.db.userOnboardingTasks.key.delete(key)
    } else if (input.operation === 'skip' || input.operation === 'complete') {
      const row = { key, userId: input.userId, task: input.task, state: input.operation === 'skip' ? 'skipped' : 'completed' }
      if (current) tx.db.userOnboardingTasks.key.update(row)
      else tx.db.userOnboardingTasks.insert(row)
    } else throw new SenderError('Invalid onboarding operation')
  }
  touchProduct(tx, input.userId, 'onboarding')
  return productJson(onboardingData(tx, input.userId))
}

function addToCollectionIn(ctx: Context, args: unknown[]) {
  const values = z
    .tuple([
      z.string().max(2_000_000),
      z.string().max(2_000_000),
      z.preprocess((value) => (typeof value === 'bigint' ? safeNumber(value) : value), z.number().int().nonnegative().transform(BigInt)),
    ])
    .parse(args)
  const input = { userId: values[0], entryId: values[1], at: values[2] }

  requireOperator(ctx)
  const key = JSON.stringify([input.userId, input.entryId])
  if (!ctx.db.collection.key.find(key)) {
    ctx.db.collection.insert({ key, ...input })
    touchProduct(ctx, input.userId, 'collection')
  }
}

function removeFromCollectionIn(ctx: Context, args: unknown[]) {
  const values = z.tuple([z.string().max(2_000_000), z.string().max(2_000_000)]).parse(args)
  const input = { userId: values[0], entryId: values[1] }

  requireOperator(ctx)
  if (ctx.db.collection.key.delete(JSON.stringify([input.userId, input.entryId]))) touchProduct(ctx, input.userId, 'collection')
}

function addFavouriteFactionIn(ctx: Context, args: unknown[]) {
  const values = z
    .tuple([
      z.string().max(2_000_000),
      z.string().max(2_000_000),
      z.preprocess((value) => (typeof value === 'bigint' ? safeNumber(value) : value), z.number().int().nonnegative().transform(BigInt)),
    ])
    .parse(args)
  const input = { userId: values[0], catalogueId: values[1], at: values[2] }

  requireOperator(ctx)
  const key = JSON.stringify([input.userId, input.catalogueId])
  if (!ctx.db.favouriteFactions.key.find(key)) {
    ctx.db.favouriteFactions.insert({ key, ...input })
    touchProduct(ctx, input.userId, 'favourites')
  }
}

function removeFavouriteFactionIn(ctx: Context, args: unknown[]) {
  const values = z.tuple([z.string().max(2_000_000), z.string().max(2_000_000)]).parse(args)
  const input = { userId: values[0], catalogueId: values[1] }

  requireOperator(ctx)
  if (ctx.db.favouriteFactions.key.delete(JSON.stringify([input.userId, input.catalogueId]))) touchProduct(ctx, input.userId, 'favourites')
}

function addFavouriteDetachmentIn(ctx: Context, args: unknown[]) {
  const values = z
    .tuple([
      z.string().max(2_000_000),
      z.string().max(2_000_000),
      z.string().max(2_000_000),
      z.preprocess((value) => (typeof value === 'bigint' ? safeNumber(value) : value), z.number().int().nonnegative().transform(BigInt)),
    ])
    .parse(args)
  const input = { userId: values[0], catalogueId: values[1], detachmentId: values[2], at: values[3] }

  requireOperator(ctx)
  const key = JSON.stringify([input.userId, input.catalogueId, input.detachmentId])
  if (!ctx.db.favouriteDetachments.key.find(key)) {
    ctx.db.favouriteDetachments.insert({ key, ...input })
    touchProduct(ctx, input.userId, 'favourites')
  }
}

function removeFavouriteDetachmentIn(ctx: Context, args: unknown[]) {
  const values = z.tuple([z.string().max(2_000_000), z.string().max(2_000_000), z.string().max(2_000_000)]).parse(args)
  const input = { userId: values[0], catalogueId: values[1], detachmentId: values[2] }

  requireOperator(ctx)
  if (ctx.db.favouriteDetachments.key.delete(JSON.stringify([input.userId, input.catalogueId, input.detachmentId])))
    touchProduct(ctx, input.userId, 'favourites')
}

function setPushEnabledIn(tx: Context, args: unknown[]) {
  const values = z
    .tuple([
      z.string().max(2_000_000),
      z.boolean(),
      z.preprocess((value) => (typeof value === 'bigint' ? safeNumber(value) : value), z.number().int().nonnegative().transform(BigInt)),
    ])
    .parse(args)
  const input = { userId: values[0], enabled: values[1], now: values[2] }

  requireOperator(tx)
  if (!input.userId || input.userId.length > 128) throw new SenderError('Invalid user ID')
  const current = tx.db.pushPreferences.userId.find(input.userId)
  const row = { userId: input.userId, enabled: input.enabled, at: input.now }
  if (current) tx.db.pushPreferences.userId.update(row)
  else tx.db.pushPreferences.insert(row)
  touchProduct(tx, input.userId, 'settings')
  return input.enabled
}

function setPlayerDefaultsIn(tx: Context, args: unknown[]) {
  const values = z
    .tuple([
      z.string().max(2_000_000),
      z.string().max(2_000_000),
      z.number().int().nonnegative().max(4_294_967_295),
      z.preprocess((value) => (typeof value === 'bigint' ? safeNumber(value) : value), z.number().int().nonnegative().transform(BigInt)),
    ])
    .parse(args)
  const input = { userId: values[0], rosterVisibility: values[1], battleSize: values[2], now: values[3] }

  requireOperator(tx)
  if (!input.userId || input.userId.length > 128 || !isPlayerDefaults(input)) throw new SenderError('Invalid player defaults')
  const row = { userId: input.userId, rosterVisibility: input.rosterVisibility, battleSize: input.battleSize, at: input.now }
  if (tx.db.playerDefaults.userId.find(input.userId)) tx.db.playerDefaults.userId.update(row)
  else tx.db.playerDefaults.insert(row)
  touchProduct(tx, input.userId, 'settings')
  return productJson({ rosterVisibility: row.rosterVisibility, battleSize: row.battleSize })
}

function leagueCommandIn(tx: Context, args: unknown[]) {
  const values = z.tuple([z.string().max(2_000_000)]).parse(args)
  const { payload } = { payload: values[0] }

  requireOperator(tx)
  if (payload.length > 2_000_000) throw new SenderError('League command is too large')
  let value: unknown
  try {
    value = JSON.parse(payload)
  } catch {
    throw new SenderError('Invalid league command')
  }
  const operation = leagueCommandInput(z.object({ op: z.string() }), value).op
  if (operation === 'create') {
    const input = leagueCommandInput(
      leagueDetailsInput.extend({
        op: z.literal('create'),
        id: leagueIdInput,
        token: leagueTokenInput,
        eventId: leagueIdInput,
        eventToken: leagueTokenInput,
        ownerId: leagueIdInput,
        recurring: z.boolean(),
        format: leagueFormatInput.nullable(),
        rosterLimit: z.number().int().positive().max(10_000).nullable(),
        ownerPlays: z.boolean().default(false),
        now: leagueTimeInput,
      }),
      value,
    )
    if (!leaguePlacesSeat(input.format, input.playerLimit)) return productJson('too-small')
    tx.db.leagues.insert({
      id: input.id,
      token: input.token,
      ownerId: input.ownerId,
      name: input.name,
      description: input.description,
      visibility: input.visibility,
      admission: input.admission,
      playerLimit: input.playerLimit ?? undefined,
      recurring: input.recurring,
      createdAt: BigInt(input.now),
    })
    tx.db.leagueEvents.insert({
      id: input.eventId,
      token: input.eventToken,
      leagueId: input.id,
      number: 1,
      format: input.format ?? undefined,
      rosterLimit: input.rosterLimit ?? undefined,
      createdAt: BigInt(input.now),
      revealedAt: undefined,
    })
    if (input.ownerPlays) insertLeagueEntry(tx, input.eventId, input.ownerId, 'accepted', input.now)
    touchProduct(tx, input.ownerId, 'leagues', 'onboarding')
    touchPublic(tx, 'leagues')
    return 'null'
  }
  const base = leagueCommandInput(z.object({ token: leagueTokenInput }), value)
  const league = tx.db.leagues.token.find(base.token)
  if (operation === 'join') {
    const input = leagueCommandInput(
      z.object({
        op: z.literal('join'),
        token: leagueTokenInput,
        eventToken: z.string().max(128),
        userId: leagueIdInput,
        now: leagueTimeInput,
        memberLimit: z.number().int().min(2).max(128),
        noticeResults: z.boolean().optional(),
      }),
      value,
    )
    if (!league) return productJson('missing')
    const event = leagueEventFor(tx, league.id, input.eventToken || null)
    if (!event) return productJson('missing')
    if (event.revealedAt !== undefined) return productJson('closed')
    const key = JSON.stringify([event.id, input.userId])
    const existing = tx.db.leagueEventEntries.key.find(key)
    if (existing && existing.status !== 'rejected') return productJson(existing.status)
    const entries = leagueEntriesFor(tx, event.id).filter((entry) => entry.status !== 'rejected')
    const accepted = entries.filter((entry) => entry.status === 'accepted').length
    if (
      leagueRegistrationFull(
        { admission: league.admission as 'automatic' | 'approval', playerLimit: league.playerLimit ?? null },
        accepted,
        entries.length,
        input.memberLimit,
      )
    )
      return productJson('full')
    const status = league.admission === 'automatic' || league.ownerId === input.userId ? 'accepted' : 'pending'
    if (existing) tx.db.leagueEventEntries.key.update({ ...existing, status, joinedAt: BigInt(input.now) })
    else insertLeagueEntry(tx, event.id, input.userId, status, input.now)
    touchLeague(tx, league.id, event.id)
    return productJson(status === 'pending' && input.noticeResults ? { status, ownerId: league.ownerId } : status)
  }
  if (!league) return productJson(operation === 'reveal' ? { outcome: 'not-ready' } : 'missing')
  const ownerId = leagueCommandInput(z.object({ ownerId: leagueIdInput }), value).ownerId
  if (operation !== 'submit' && operation !== 'create-battle' && league.ownerId !== ownerId)
    return productJson(operation === 'reveal' ? { outcome: 'not-ready' } : 'forbidden')

  if (operation === 'create-event') {
    const input = leagueCommandInput(
      leagueDetailsInput.extend({
        op: z.literal('create-event'),
        id: leagueIdInput,
        eventToken: leagueTokenInput,
        format: leagueFormatInput.nullable(),
        rosterLimit: z.number().int().positive().max(10_000).nullable(),
        ownerPlays: z.boolean().default(false),
        now: leagueTimeInput,
      }),
      value,
    )
    if (!leaguePlacesSeat(input.format ?? null, input.playerLimit)) return productJson('too-small')
    const latest = leagueEventFor(tx, league.id, null)
    if (!latest || latest.revealedAt === undefined) return productJson('open')
    tx.db.leagues.id.update({
      ...league,
      name: input.name,
      description: input.description,
      visibility: input.visibility,
      admission: input.admission,
      playerLimit: input.playerLimit ?? undefined,
      recurring: true,
    })
    tx.db.leagueEvents.insert({
      id: input.id,
      token: input.eventToken,
      leagueId: league.id,
      number: latest.number + 1,
      format: input.format ?? undefined,
      rosterLimit: input.rosterLimit ?? undefined,
      createdAt: BigInt(input.now),
      revealedAt: undefined,
    })
    if (input.ownerPlays) insertLeagueEntry(tx, input.id, league.ownerId, 'accepted', input.now)
    touchLeague(tx, league.id, latest.id)
    return productJson('created')
  }
  if (operation === 'update') {
    const input = leagueCommandInput(
      leagueDetailsInput.extend({ op: z.literal('update'), rule: leagueRuleInput.nullable().default(null) }),
      value,
    )
    const current = leagueEventFor(tx, league.id, null)
    if (!current) return productJson('missing')
    const entries = leagueEntriesFor(tx, current.id)
    const accepted = entries.filter((entry) => entry.status === 'accepted').length
    const rule = input.rule && (input.rule.format !== current.format || input.rule.rosterLimit !== current.rosterLimit) ? input.rule : null
    if (rule) {
      if (current.revealedAt !== undefined) return productJson('closed')
      if (entries.some((entry) => entry.rosterSnapshot !== undefined)) return productJson('sealed')
    }
    const format = (rule?.format ?? current.format ?? null) as '1v1' | '2v1' | '2v2' | null
    if ((rule || input.playerLimit !== (league.playerLimit ?? null)) && current.revealedAt === undefined) {
      if (!leaguePlacesSeat(format, input.playerLimit)) return productJson('team-minimum')
      if (input.playerLimit !== null && input.playerLimit < accepted) return productJson('below-accepted')
    }
    if (rule) {
      tx.db.leagueEvents.id.update({ ...current, format: rule.format, rosterLimit: rule.rosterLimit })
      for (const entry of entries) tx.db.leagueEventEntries.key.update({ ...entry, requiredLimit: undefined, teamId: undefined })
    }
    tx.db.leagues.id.update({
      ...league,
      name: input.name,
      description: input.description,
      visibility: input.visibility,
      admission: input.admission,
      playerLimit: input.playerLimit ?? undefined,
    })
    const admitted =
      input.admission === 'automatic' && league.admission === 'approval' && current.revealedAt === undefined
        ? admitWaiting(tx, entries, input.playerLimit, () => true)
        : []
    touchLeague(tx, league.id)
    return productJson({ admitted, ruleChanged: rule !== null })
  }
  if (operation === 'delete') {
    deleteLeague(tx, league.id)
    return productJson('deleted')
  }
  const eventToken = leagueCommandInput(z.object({ eventToken: z.string().max(128) }), value).eventToken
  const event = leagueEventFor(tx, league.id, eventToken || null)
  if (!event) return productJson(operation === 'reveal' ? { outcome: 'not-ready' } : 'missing')
  if (operation === 'admit') {
    const input = leagueCommandInput(z.object({ op: z.literal('admit'), userIds: z.array(leagueIdInput).max(128) }), value)
    if (event.revealedAt !== undefined) return productJson('closed')
    const chosen = new Set(input.userIds)
    const admitted = admitWaiting(tx, leagueEntriesFor(tx, event.id), league.playerLimit ?? null, (entry) => chosen.has(entry.userId))
    if (admitted.length) touchLeague(tx, league.id, event.id)
    return productJson({ admitted })
  }
  if (operation === 'add') {
    const input = leagueCommandInput(
      z.object({
        op: z.literal('add'),
        userIds: z.array(leagueIdInput).min(1).max(128),
        memberLimit: z.number().int().min(2).max(128),
        now: leagueTimeInput,
      }),
      value,
    )
    if (event.revealedAt !== undefined) return productJson('closed')
    const userIds = [...new Set(input.userIds)]
    if (userIds.some((userId) => userId === league.ownerId || friendshipBetween(tx, league.ownerId, userId)?.acceptedAt === undefined))
      return productJson('not-friends')
    const entries = leagueEntriesFor(tx, event.id)
    const current = new Map(entries.map((entry) => [entry.userId, entry]))
    const added = userIds.filter((userId) => current.get(userId)?.status !== 'accepted')
    const accepted = entries.filter((entry) => entry.status === 'accepted').length + added.length
    const returning = added.filter((userId) => current.get(userId)?.status === 'pending').length
    const active = entries.filter((entry) => entry.status !== 'rejected').length + added.length - returning
    if ((league.playerLimit !== undefined && accepted > league.playerLimit) || active > input.memberLimit) return productJson('full')
    for (const userId of added) {
      const existing = current.get(userId)
      if (existing) tx.db.leagueEventEntries.key.update({ ...existing, status: 'accepted', joinedAt: BigInt(input.now) })
      else insertLeagueEntry(tx, event.id, userId, 'accepted', input.now)
    }
    if (added.length) touchLeague(tx, league.id, event.id)
    return productJson({ added })
  }
  if (operation === 'moderate') {
    const input = leagueCommandInput(
      z.object({
        op: z.literal('moderate'),
        userId: leagueIdInput,
        status: z.enum(['accepted', 'rejected']),
        memberLimit: z.number().int().min(2).max(128),
        noticeResults: z.boolean().optional(),
      }),
      value,
    )
    if (event.revealedAt !== undefined) return productJson('closed')
    const entry = tx.db.leagueEventEntries.key.find(JSON.stringify([event.id, input.userId]))
    if (!entry) return productJson('missing')
    const entries = leagueEntriesFor(tx, event.id)
    if (input.status === 'accepted' && entry.status !== 'accepted') {
      if (league.playerLimit !== undefined && entries.filter((row) => row.status === 'accepted').length >= league.playerLimit)
        return productJson('full')
      if (entry.status === 'rejected' && entries.filter((row) => row.status !== 'rejected').length >= input.memberLimit)
        return productJson('full')
    }
    const resealIds =
      input.status === 'rejected' && entry.teamId
        ? entries
            .filter((row) => row.userId !== entry.userId && row.teamId === entry.teamId && row.rosterSnapshot !== undefined)
            .map((row) => row.userId)
        : []
    if (input.status === 'rejected' && entry.teamId) {
      for (const teammate of entries.filter((row) => row.teamId === entry.teamId))
        tx.db.leagueEventEntries.key.update({
          ...teammate,
          teamId: undefined,
          requiredLimit: undefined,
          rosterId: undefined,
          rosterName: undefined,
          rosterSnapshot: undefined,
          submittedAt: undefined,
        })
    }
    if (input.status === 'rejected')
      tx.db.leagueEventEntries.key.update({
        ...entry,
        status: input.status,
        teamId: undefined,
        requiredLimit: undefined,
        rosterId: undefined,
        rosterName: undefined,
        rosterSnapshot: undefined,
        submittedAt: undefined,
      })
    else tx.db.leagueEventEntries.key.update({ ...entry, status: input.status })
    touchLeague(tx, league.id, event.id)
    if (input.status === 'rejected')
      return productJson(input.noticeResults ? { rejected: entry.status !== 'rejected', resealIds } : 'updated')
    return productJson(entry.status !== 'accepted' ? 'admitted' : 'updated')
  }
  if (operation === 'assign-limit') {
    const input = leagueCommandInput(
      z.object({
        op: z.literal('assign-limit'),
        userId: leagueIdInput,
        requiredLimit: z.number().int().positive().max(10_000),
        noticeResults: z.boolean().optional(),
      }),
      value,
    )
    if (event.revealedAt !== undefined) return productJson('closed')
    if (event.format !== '2v1') return productJson('wrong-format')
    if (input.requiredLimit !== event.rosterLimit && input.requiredLimit !== alliedLeagueRosterLimit(event.rosterLimit ?? 0))
      return productJson('wrong-limit')
    const entry = tx.db.leagueEventEntries.key.find(JSON.stringify([event.id, input.userId]))
    if (!entry || entry.status !== 'accepted') return productJson('missing')
    const resealIds = entry.requiredLimit !== input.requiredLimit && entry.rosterSnapshot !== undefined ? [entry.userId] : []
    if (entry.requiredLimit !== input.requiredLimit) {
      tx.db.leagueEventEntries.key.update({
        ...entry,
        requiredLimit: input.requiredLimit,
        rosterId: undefined,
        rosterName: undefined,
        rosterSnapshot: undefined,
        submittedAt: undefined,
      })
      touchLeague(tx, league.id, event.id)
    }
    return productJson(input.noticeResults ? { resealIds } : 'updated')
  }
  if (operation === 'assign-team') {
    const input = leagueCommandInput(
      z.object({
        op: z.literal('assign-team'),
        userIds: z.array(leagueIdInput).min(1).max(2),
        teamId: leagueIdInput,
        noticeResults: z.boolean().optional(),
      }),
      value,
    )
    if (event.revealedAt !== undefined) return productJson('closed')
    if (event.format !== '2v2' || event.rosterLimit === undefined) return productJson('wrong-format')
    const userIds = [...new Set(input.userIds)]
    const entries = leagueEntriesFor(tx, event.id)
    const targets = entries.filter((entry) => userIds.includes(entry.userId) && entry.status === 'accepted')
    if (targets.length !== userIds.length) return productJson('missing')
    const previousTeamId = targets[0]?.teamId
    if (userIds.length === 2 && previousTeamId && targets.every((entry) => entry.teamId === previousTeamId))
      return productJson(input.noticeResults ? { resealIds: [] } : 'updated')
    const oldTeams = new Set(targets.map((entry) => entry.teamId).filter((id) => id !== undefined))
    const affected = entries.filter((entry) => userIds.includes(entry.userId) || (entry.teamId && oldTeams.has(entry.teamId)))
    const resealIds = affected.filter((entry) => entry.rosterSnapshot !== undefined).map((entry) => entry.userId)
    for (const entry of affected)
      tx.db.leagueEventEntries.key.update({
        ...entry,
        teamId: undefined,
        requiredLimit: undefined,
        rosterId: undefined,
        rosterName: undefined,
        rosterSnapshot: undefined,
        submittedAt: undefined,
      })
    if (userIds.length === 2)
      for (const entry of targets)
        tx.db.leagueEventEntries.key.update({
          ...entry,
          teamId: input.teamId,
          requiredLimit: alliedLeagueRosterLimit(event.rosterLimit),
          rosterId: undefined,
          rosterName: undefined,
          rosterSnapshot: undefined,
          submittedAt: undefined,
        })
    touchLeague(tx, league.id, event.id)
    return productJson(input.noticeResults ? { resealIds } : 'updated')
  }
  if (operation === 'submit') {
    const input = leagueCommandInput(
      z.object({
        op: z.literal('submit'),
        userId: leagueIdInput,
        rosterId: leagueIdInput,
        rosterName: z.string().max(100),
        rosterLimit: z.number().int().nonnegative().max(10_000).nullable(),
        rosterUpdatedAt: leagueTimeInput,
        snapshot: z.string().min(1).max(1_000_000),
        now: leagueTimeInput,
      }),
      value,
    )
    const entry = tx.db.leagueEventEntries.key.find(JSON.stringify([event.id, input.userId]))
    if (!entry || entry.status !== 'accepted' || (event.revealedAt !== undefined && entry.rosterSnapshot !== undefined))
      return productJson({ outcome: 'missing' })
    const requiredLimit = requiredLeagueRosterLimit(
      (event.format ?? null) as '1v1' | '2v1' | '2v2' | null,
      event.rosterLimit ?? null,
      entry.requiredLimit ?? null,
      entry.teamId ?? null,
    )
    if ((event.format === '2v1' || event.format === '2v2') && requiredLimit === null) return productJson({ outcome: 'unassigned' })
    if (requiredLimit !== null && input.rosterLimit !== requiredLimit) return productJson({ outcome: 'wrong-limit' })
    let submitted: Roster
    try {
      submitted = parseRosterSnapshot(input.snapshot)
    } catch {
      return productJson({ outcome: 'missing' })
    }
    const selected = leagueWarlords([submitted])
    if (event.format !== '2v2' && (!selected.eligible || selected.count !== 1))
      return productJson({ outcome: 'invalid-warlords', format: event.format ?? null })
    if (event.format === '2v2') {
      const teammate = leagueEntriesFor(tx, event.id).find(
        (row) => row.userId !== input.userId && row.teamId === entry.teamId && row.status === 'accepted',
      )
      if (!teammate) return productJson({ outcome: 'unassigned' })
      if (!selected.eligible || selected.count > 1) return productJson({ outcome: 'invalid-warlords', format: '2v2' })
      if (teammate.rosterSnapshot !== undefined) {
        let teammateRoster: Roster
        try {
          teammateRoster = parseRosterSnapshot(teammate.rosterSnapshot)
        } catch {
          return productJson({ outcome: 'missing' })
        }
        const team = leagueWarlords([submitted, teammateRoster])
        if (!team.eligible || team.count !== 1) return productJson({ outcome: 'invalid-warlords', format: '2v2' })
      }
    }
    const saved = tx.db.rosters.id.find(input.rosterId)
    if (
      !saved ||
      saved.userId !== input.userId ||
      saved.updatedAt !== BigInt(input.rosterUpdatedAt) ||
      (requiredLimit !== null && saved.limit !== requiredLimit)
    )
      return productJson({ outcome: 'missing' })
    tx.db.leagueEventEntries.key.update({
      ...entry,
      rosterId: input.rosterId,
      rosterName: input.rosterName,
      rosterSnapshot: input.snapshot,
      submittedAt: BigInt(input.now),
    })
    touchLeague(tx, league.id, event.id)
    return productJson({ outcome: 'sealed', format: event.format ?? null, requiredLimit })
  }
  if (operation === 'reveal') {
    const input = leagueCommandInput(z.object({ op: z.literal('reveal'), now: leagueTimeInput }), value)
    if (event.revealedAt !== undefined) return productJson({ outcome: 'not-ready' })
    const all = leagueEntriesFor(tx, event.id)
    const entries = all.filter((entry) => entry.status === 'accepted')
    const checks = leagueRevealChecklist(
      {
        format: (event.format ?? null) as '1v1' | '2v1' | '2v2' | null,
        rosterLimit: event.rosterLimit ?? null,
        playerLimit: league.playerLimit ?? null,
      },
      all.map((entry) => ({
        userId: entry.userId,
        status: entry.status as 'pending' | 'accepted' | 'rejected',
        submitted: entry.rosterSnapshot !== undefined,
        requiredLimit: entry.requiredLimit ?? null,
        teamId: entry.teamId ?? null,
      })),
    )
    if (!checks.every((check) => check.done)) return productJson({ outcome: 'not-ready' })
    let snapshots: Roster[] = []
    if (event.format !== undefined) {
      try {
        snapshots = entries.map((entry) => parseRosterSnapshot(entry.rosterSnapshot!))
      } catch {
        return productJson({ outcome: 'not-ready' })
      }
    }
    if (
      event.format !== undefined &&
      event.format !== '2v2' &&
      snapshots.some((snapshot) => {
        const selected = leagueWarlords([snapshot], true)
        return !selected.eligible || selected.count !== 1
      })
    )
      return productJson({ outcome: 'invalid-warlords', format: event.format })
    if (event.format === '2v2') {
      const teams = new Map<string, Roster[]>()
      entries.forEach((entry, index) => teams.set(entry.teamId!, [...(teams.get(entry.teamId!) ?? []), snapshots[index]!]))
      if (
        [...teams.values()].some((team) => {
          const selected = leagueWarlords(team)
          return !selected.eligible || selected.count !== 1
        })
      )
        return productJson({ outcome: 'invalid-warlords', format: '2v2' })
    }
    if (
      event.format !== undefined &&
      entries.some((entry, index) => {
        const required = requiredLeagueRosterLimit(
          event.format as '1v1' | '2v1' | '2v2',
          event.rosterLimit ?? null,
          entry.requiredLimit ?? null,
          entry.teamId ?? null,
        )
        return required === null || snapshots[index]!.built?.limit !== required
      })
    )
      return productJson({ outcome: 'not-ready' })
    for (const entry of all.filter((row) => row.status === 'pending')) tx.db.leagueEventEntries.key.update({ ...entry, status: 'rejected' })
    tx.db.leagueEvents.id.update({ ...event, revealedAt: BigInt(input.now) })
    touchLeague(tx, league.id, event.id)
    return productJson({ outcome: 'revealed', entrantIds: entries.map((entry) => entry.userId) })
  }
  if (operation === 'unseal') {
    const input = leagueCommandInput(z.object({ op: z.literal('unseal'), userId: leagueIdInput }), value)
    if (event.revealedAt === undefined) return productJson('not-revealed')
    const entry = tx.db.leagueEventEntries.key.find(JSON.stringify([event.id, input.userId]))
    if (!entry || entry.status !== 'accepted' || entry.rosterSnapshot === undefined) return productJson('missing')
    resetLeagueEntry(tx, entry)
    touchLeague(tx, league.id, event.id)
    return productJson('unsealed')
  }
  if (operation === 'create-battle') {
    const input = leagueCommandInput(
      z.object({
        op: z.literal('create-battle'),
        id: leagueIdInput,
        battleToken: leagueTokenInput,
        userId: leagueIdInput,
        allyIds: z.array(leagueIdInput).max(3),
        opponentIds: z.array(leagueIdInput).min(1).max(3),
        initialCommands: z.array(commandSchema).max(1_000),
        now: leagueTimeInput,
        expectedLatest: z.boolean(),
        expectedEntries: z.array(z.object({ userId: leagueIdInput, snapshot: z.string().max(1_000_000) })).max(128),
      }),
      value,
    )
    if (event.revealedAt === undefined) return productJson(false)
    if (input.expectedLatest && leagueEventFor(tx, league.id, null)?.id !== event.id) return productJson(false)
    const seatIds = [input.userId, ...input.allyIds, ...input.opponentIds]
    if (seatIds.length > 4 || new Set(seatIds).size !== seatIds.length) return productJson(false)
    const entries = leagueEntriesFor(tx, event.id).filter(
      (entry) =>
        entry.status === 'accepted' && entry.rosterSnapshot !== undefined && (event.format === '2v2' || seatIds.includes(entry.userId)),
    )
    if (
      entries.length !== input.expectedEntries.length ||
      entries.some(
        (entry, index) =>
          entry.userId !== input.expectedEntries[index]?.userId || entry.rosterSnapshot !== input.expectedEntries[index]?.snapshot,
      )
    )
      return productJson(false)
    if (seatIds.some((id) => !entries.some((entry) => entry.userId === id))) return productJson(false)
    const seats = [
      { id: input.userId, side: 0 },
      ...input.allyIds.map((id) => ({ id, side: 0 })),
      ...input.opponentIds.map((id) => ({ id, side: 1 })),
    ]
    tx.db.battles.insert({ id: input.id, token: input.battleToken, createdAt: BigInt(input.now) })
    for (const [index, seat] of seats.entries())
      tx.db.battleUsers.insert({
        key: JSON.stringify([input.id, seat.id]),
        battleId: input.id,
        userId: seat.id,
        side: seat.side,
        joinedAt: BigInt(input.now + index),
      })
    const log: LoggedCommand[] = []
    for (const [index, command] of input.initialCommands.entries()) {
      const state = reduceBattle(
        seats.map((seat) => seat.id),
        log,
        seats.map((seat) => seat.side),
      )
      const refusal = validate(state, input.userId, command)
      if (refusal) throw new SenderError(`new battle command was refused: ${refusal}`)
      const seq = index + 1
      tx.db.commands.insert({
        key: JSON.stringify([input.id, seq]),
        battleId: input.id,
        seq,
        userId: input.userId,
        at: BigInt(input.now),
        body: JSON.stringify(command),
      })
      log.push({ seq, by: input.userId, at: input.now, command })
    }
    tx.db.leagueEventBattles.insert({ battleId: input.id, eventId: event.id })
    touchLeague(tx, league.id, event.id)
    for (const seat of seats) touchProduct(tx, seat.id, 'battles', 'onboarding')
    touchPublic(tx, 'battles')
    touchAdmin(tx)
    return productJson(true)
  }
  throw new SenderError('Unknown league command')
}

const syncProductActions = {
  create_battle: createBattleIn,
  remove_battle: removeBattleIn,
  request_friend: requestFriendIn,
  accept_friend: acceptFriendIn,
  reject_friend: rejectFriendIn,
  remove_friend: removeFriendIn,
  replace_friend_invite: replaceFriendInviteIn,
  cancel_friend_invite: cancelFriendInviteIn,
  accept_friend_invite: acceptFriendInviteIn,
  set_battle_audience: setBattleAudienceIn,
  update_onboarding: updateOnboardingIn,
  add_to_collection: addToCollectionIn,
  remove_from_collection: removeFromCollectionIn,
  add_favourite_faction: addFavouriteFactionIn,
  remove_favourite_faction: removeFavouriteFactionIn,
  add_favourite_detachment: addFavouriteDetachmentIn,
  remove_favourite_detachment: removeFavouriteDetachmentIn,
  set_push_enabled: setPushEnabledIn,
  set_player_defaults: setPlayerDefaultsIn,
  league_command: leagueCommandIn,
}

const syncProductInput = z.object({
  id: z.uuid(),
  owner: z.string().min(1).max(128),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.number().int().nonnegative(),
  name: z.string(),
  args: z.array(z.unknown()).max(8),
})
const SYNC_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000

export const syncReceipt = spacetime.procedure({ id: t.string(), owner: t.string(), fingerprint: t.string() }, t.string(), (ctx, input) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    const receipt = tx.db.syncReceipts.id.find(input.id)
    if (!receipt) return 'null'
    if (receipt.owner !== input.owner || receipt.fingerprint !== input.fingerprint) throw new SenderError('Operation ID reused')
    return productJson({ outcome: receipt.outcome, message: receipt.message })
  }),
)

export const syncProduct = spacetime.procedure({ payload: t.string() }, t.string(), (ctx, { payload }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (payload.length > 2_100_000) throw new SenderError('Saved action is too large')
    const input = syncProductInput.parse(JSON.parse(payload))
    const prior = tx.db.syncReceipts.id.find(input.id)
    if (prior) {
      if (prior.owner !== input.owner || prior.fingerprint !== input.fingerprint) throw new SenderError('Operation ID reused')
      return prior.result
    }
    const now = safeNumber(tx.timestamp.microsSinceUnixEpoch / 1_000n)
    if (input.createdAt < now - SYNC_RETENTION_MS || input.createdAt > now + 5 * 60_000)
      throw new SenderError('Saved action expired; review it before sending it again')
    const receipts = Array.from(tx.db.syncReceipts.owner.filter(input.owner))
    for (const receipt of receipts) if (receipt.createdAt < BigInt(now - SYNC_RETENTION_MS)) tx.db.syncReceipts.id.delete(receipt.id)
    if (receipts.filter((receipt) => receipt.createdAt >= BigInt(now - SYNC_RETENTION_MS)).length >= 10_000)
      throw new SenderError('Too many recent saved actions')
    if (!Object.hasOwn(syncProductActions, input.name)) throw new SenderError('Unsupported saved action')
    const action = syncProductActions[input.name as keyof typeof syncProductActions]
    const result = action(tx, input.args)
    const decoded: unknown = typeof result === 'string' && input.name !== 'set_battle_audience' ? JSON.parse(result) : result
    const refusal = productSyncRefusal(input.name, decoded)
    tx.db.syncReceipts.insert({
      id: input.id,
      owner: input.owner,
      fingerprint: input.fingerprint,
      createdAt: BigInt(now),
      result: productJson(result ?? null),
      outcome: refusal ? 'refused' : 'applied',
      message: refusal ?? '',
    })
    return productJson(result ?? null)
  }),
)
