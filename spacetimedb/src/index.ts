import { ScheduleAt } from 'spacetimedb'
import { SenderError, schema, table, t, type InferSchema, type ReducerCtx } from 'spacetimedb/server'
import { ROSTER_SOURCES, ROSTER_VISIBILITIES } from '../../src/core/savedRoster'
import { DEFAULT_PUSH_NOTIFICATIONS, PUSH_TOKENS_PER_USER, PUSH_PLATFORMS } from '../../src/core/notificationConfig'
import { reduceBattle, validate, type LoggedCommand } from '../../src/core/battle'
import { commandSchema } from '../../src/core/commands'
import { BATTLE_AUDIENCES, DEFAULT_BATTLE_AUDIENCE } from '../../src/core/battleAudience'
import { onboardingTaskIds, tourTaskIds } from '../../src/core/onboarding'
import { alliedLeagueRosterLimit, requiredLeagueRosterLimit } from '../../src/core/league'
import { parseRosterSnapshot } from '../../src/core/commands'
import type { Roster } from '../../src/core/battle'
import { z } from 'zod'
import { productTables } from './productSchema'

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

const spacetime = schema({ settings, sessionAccess, revokedSession, accessExpiry, revocationExpiry, watchedBattles, ...productTables })
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

function deleteBattle(ctx: Context, battleId: string) {
  for (const row of Array.from(ctx.db.watchedBattles.battleId.filter(battleId))) ctx.db.watchedBattles.key.delete(row.key)
  for (const row of Array.from(ctx.db.commands.battleId.filter(battleId))) ctx.db.commands.key.delete(row.key)
  for (const row of Array.from(ctx.db.battleUsers.battleId.filter(battleId))) ctx.db.battleUsers.key.delete(row.key)
  ctx.db.leagueEventBattles.battleId.delete(battleId)
  ctx.db.battles.id.delete(battleId)
}

function deleteLeague(ctx: Context, leagueId: string) {
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
  const secureIssuer = /^https:\/\/[^/?#@]+\/api\/auth$/.test(input.issuer)
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
  if (configured?.owner.isEqual(ctx.sender) || (configured?.operator && configured.operator === ctx.sender.toHexString())) return
  const jwt = ctx.senderAuth.jwt
  if (
    !configured?.issuer ||
    !jwt ||
    jwt.issuer !== configured.issuer ||
    jwt.audience.length !== 1 ||
    jwt.audience[0] !== configured.audience
  ) {
    throw new SenderError('Invalid auth token')
  }
  const userId = jwt.fullPayload.userId
  const expiresAt = jwt.fullPayload.accessExpiresAt
  const tokenExpiresAt = jwt.fullPayload.exp
  const tokenType = jwt.fullPayload.tokenType
  const now = nowSeconds(ctx)
  if (
    typeof jwt.subject !== 'string' ||
    jwt.subject.length === 0 ||
    jwt.subject.length > 128 ||
    typeof userId !== 'string' ||
    userId.length === 0 ||
    userId.length > 128 ||
    typeof expiresAt !== 'number' ||
    !Number.isSafeInteger(expiresAt) ||
    typeof tokenExpiresAt !== 'number' ||
    !Number.isSafeInteger(tokenExpiresAt) ||
    tokenType !== 'spacetime-access' ||
    BigInt(expiresAt) <= now ||
    BigInt(expiresAt) > now + MAX_TOKEN_SECONDS ||
    BigInt(tokenExpiresAt) <= now ||
    BigInt(tokenExpiresAt) > now + MAX_TOKEN_SECONDS ||
    ctx.db.revokedSession.subject.find(jwt.subject)
  ) {
    throw new SenderError('Invalid auth token')
  }
  const current = ctx.db.sessionAccess.subject.find(jwt.subject)
  if (current && (!current.identity.isEqual(ctx.sender) || current.userId !== userId)) throw new SenderError('Session identity changed')
  if (current) ctx.db.sessionAccess.subject.update({ ...current, expiresAt: BigInt(expiresAt) })
  else ctx.db.sessionAccess.insert({ subject: jwt.subject, identity: ctx.sender, userId, expiresAt: BigInt(expiresAt) })
  ctx.db.accessExpiry.insert({ scheduledId: 0n, subject: jwt.subject, scheduledAt: ScheduleAt.time(BigInt(expiresAt) * 1_000_000n) })
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
  for (const row of Array.from(ctx.db.pushTokens.userId.filter(userId))) ctx.db.pushTokens.token.delete(row.token)
  for (const row of Array.from(ctx.db.friendships.requesterId.filter(userId))) ctx.db.friendships.key.delete(row.key)
  for (const row of Array.from(ctx.db.friendships.addresseeId.filter(userId))) ctx.db.friendships.key.delete(row.key)
  const invite = ctx.db.friendInvites.inviterId.find(userId)
  if (invite) ctx.db.friendInvites.token.delete(invite.token)
  for (const row of Array.from(ctx.db.commands.userId.filter(userId))) ctx.db.commands.key.delete(row.key)
  for (const row of Array.from(ctx.db.battleUsers.userId.filter(userId))) ctx.db.battleUsers.key.delete(row.key)
  for (const row of Array.from(ctx.db.rosters.userId.filter(userId))) ctx.db.rosters.id.delete(row.id)
  for (const row of Array.from(ctx.db.leagueEventEntries.userId.filter(userId))) ctx.db.leagueEventEntries.key.delete(row.key)
  for (const row of Array.from(ctx.db.collection.userId.filter(userId))) ctx.db.collection.key.delete(row.key)
  for (const row of Array.from(ctx.db.favouriteFactions.userId.filter(userId))) ctx.db.favouriteFactions.key.delete(row.key)
  for (const row of Array.from(ctx.db.favouriteDetachments.userId.filter(userId))) ctx.db.favouriteDetachments.key.delete(row.key)
  ctx.db.practiceOpponents.userId.delete(userId)
})

export const expireAccess = spacetime.reducer({ onSchedule: accessExpiry }, { timer: accessExpiry.rowType }, (ctx, { timer }) => {
  const current = ctx.db.sessionAccess.subject.find(timer.subject)
  if (current && current.expiresAt <= nowSeconds(ctx)) {
    ctx.db.sessionAccess.subject.delete(timer.subject)
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
      return command.success ? [{ seq: row.seq, by: row.userId, at: safeNumber(row.at), command: command.data }] : []
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
  ctx.withTx((tx) => {
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
    }
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
  }),
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
  ctx.withTx((tx) => {
    requireOperator(tx)
    const opener = Array.from(tx.db.battleUsers.battleId.filter(input.battleId))
      .filter((seat) => seat.side === 0)
      .sort((left, right) => (left.joinedAt > right.joinedAt ? 1 : left.joinedAt < right.joinedAt ? -1 : 0))[0]
    if (!opener || opener.userId !== input.userId) return false
    deleteBattle(tx, input.battleId)
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
      const parsed = commandSchema.safeParse(JSON.parse(input.body))
      if (!parsed.success) throw new SenderError('Invalid battle command')
      const { seats, log } = battleData(tx, input.battleId)
      const state = reduceBattle(
        seats.map((seat) => seat.id),
        log,
        seats.map((seat) => seat.side),
        seats.filter((seat) => seat.automated).map((seat) => seat.id),
      )
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
        at: input.now,
        body: JSON.stringify(parsed.data),
      })
      return productJson({
        result: { outcome: 'appended', seq },
        log: [...log, { seq, by: input.userId, at: safeNumber(input.now), command: parsed.data }],
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

export const requestFriend = spacetime.procedure(
  { requesterId: t.string(), addresseeId: t.string(), now: t.u64() },
  t.bool(),
  (ctx, input) =>
    ctx.withTx((tx) => {
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
      return true
    }),
)

export const acceptFriend = spacetime.procedure(
  { requesterId: t.string(), addresseeId: t.string(), now: t.u64() },
  t.bool(),
  (ctx, input) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      const current = tx.db.friendships.key.find(friendshipKey(input.requesterId, input.addresseeId))
      if (!current || current.acceptedAt !== undefined) return false
      tx.db.friendships.key.update({ ...current, acceptedAt: input.now })
      return true
    }),
)

export const rejectFriend = spacetime.procedure({ requesterId: t.string(), addresseeId: t.string() }, t.bool(), (ctx, input) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    const current = tx.db.friendships.key.find(friendshipKey(input.requesterId, input.addresseeId))
    if (
      !current ||
      current.requesterId !== input.requesterId ||
      current.addresseeId !== input.addresseeId ||
      current.acceptedAt !== undefined
    )
      return false
    return tx.db.friendships.key.delete(current.key)
  }),
)

export const removeFriend = spacetime.procedure({ leftId: t.string(), rightId: t.string() }, t.bool(), (ctx, input) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    const current = friendshipBetween(tx, input.leftId, input.rightId)
    return current ? tx.db.friendships.key.delete(current.key) : false
  }),
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
  requireOperator(ctx)
  if (!input.inviterId || input.inviterId.length > 128 || !input.token || input.token.length > 128) throw new SenderError('Invalid invite')
  const current = ctx.db.friendInvites.inviterId.find(input.inviterId)
  if (current) ctx.db.friendInvites.token.delete(current.token)
  ctx.db.friendInvites.insert({ inviterId: input.inviterId, token: input.token, createdAt: input.now })
})

export const cancelFriendInvite = spacetime.procedure({ inviterId: t.string() }, t.bool(), (ctx, { inviterId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    const current = tx.db.friendInvites.inviterId.find(inviterId)
    return current ? tx.db.friendInvites.token.delete(current.token) : false
  }),
)

export const acceptFriendInvite = spacetime.procedure(
  { token: t.string(), recipientId: t.string(), now: t.u64() },
  t.string(),
  (ctx, input) =>
    ctx.withTx((tx) => {
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
      return productJson({ inviterId: invite.inviterId })
    }),
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
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (!input.userId || input.userId.length > 128 || !(BATTLE_AUDIENCES as readonly string[]).includes(input.audience)) {
      throw new SenderError('Invalid battle audience')
    }
    const current = tx.db.battleSharing.userId.find(input.userId)
    const row = { userId: input.userId, audience: input.audience, at: input.now }
    if (current) tx.db.battleSharing.userId.update(row)
    else tx.db.battleSharing.insert(row)
    return input.audience
  }),
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
  (ctx, input) =>
    ctx.withTx((tx) => {
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
      return productJson(onboardingData(tx, input.userId))
    }),
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

export const saveRoster = spacetime.procedure({ payload: t.string() }, t.string(), (ctx, { payload }) => {
  if (payload.length > 1_200_000) throw new SenderError('Roster is too large')
  const input = parseRoster(payload)
  return ctx.withTx((tx) => {
    requireOperator(tx)
    const current = tx.db.rosters.id.find(input.id)
    if (current?.userId !== undefined && current.userId !== input.userId) return 'forbidden'
    const fields = {
      name: input.name,
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
      updatedAt: BigInt(input.now),
    }
    if (current) {
      tx.db.rosters.id.update({ ...current, ...fields })
      return 'updated'
    }
    tx.db.rosters.insert({ id: input.id, userId: input.userId, createdAt: BigInt(input.now), ...fields })
    return 'inserted'
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
      tx.db.rosters.id.update({ ...current, visibility, updatedAt: now })
      return true
    }),
)

export const deleteRoster = spacetime.reducer({ id: t.string(), userId: t.string() }, (ctx, { id, userId }) => {
  requireOperator(ctx)
  const current = ctx.db.rosters.id.find(id)
  if (current?.userId === userId) ctx.db.rosters.id.delete(id)
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
  requireOperator(ctx)
  const key = JSON.stringify([input.userId, input.entryId])
  if (!ctx.db.collection.key.find(key)) ctx.db.collection.insert({ key, ...input })
})

export const removeFromCollection = spacetime.reducer({ userId: t.string(), entryId: t.string() }, (ctx, input) => {
  requireOperator(ctx)
  ctx.db.collection.key.delete(JSON.stringify([input.userId, input.entryId]))
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
  requireOperator(ctx)
  const key = JSON.stringify([input.userId, input.catalogueId])
  if (!ctx.db.favouriteFactions.key.find(key)) ctx.db.favouriteFactions.insert({ key, ...input })
})

export const removeFavouriteFaction = spacetime.reducer({ userId: t.string(), catalogueId: t.string() }, (ctx, input) => {
  requireOperator(ctx)
  ctx.db.favouriteFactions.key.delete(JSON.stringify([input.userId, input.catalogueId]))
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
    requireOperator(ctx)
    const key = JSON.stringify([input.userId, input.catalogueId, input.detachmentId])
    if (!ctx.db.favouriteDetachments.key.find(key)) ctx.db.favouriteDetachments.insert({ key, ...input })
  },
)

export const removeFavouriteDetachment = spacetime.reducer(
  { userId: t.string(), catalogueId: t.string(), detachmentId: t.string() },
  (ctx, input) => {
    requireOperator(ctx)
    ctx.db.favouriteDetachments.key.delete(JSON.stringify([input.userId, input.catalogueId, input.detachmentId]))
  },
)

export const pushEnabled = spacetime.procedure({ userId: t.string() }, t.bool(), (ctx, { userId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    return tx.db.pushPreferences.userId.find(userId)?.enabled ?? DEFAULT_PUSH_NOTIFICATIONS
  }),
)

export const setPushEnabled = spacetime.procedure({ userId: t.string(), enabled: t.bool(), now: t.u64() }, t.bool(), (ctx, input) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (!input.userId || input.userId.length > 128) throw new SenderError('Invalid user ID')
    const current = tx.db.pushPreferences.userId.find(input.userId)
    const row = { userId: input.userId, enabled: input.enabled, at: input.now }
    if (current) tx.db.pushPreferences.userId.update(row)
    else tx.db.pushPreferences.insert(row)
    return input.enabled
  }),
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
      if (!(tx.db.pushPreferences.userId.find(userId)?.enabled ?? DEFAULT_PUSH_NOTIFICATIONS)) continue
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

function resetLeagueEntry(ctx: Context, entry: LeagueEntryRow) {
  ctx.db.leagueEventEntries.key.update({
    ...entry,
    rosterId: undefined,
    rosterName: undefined,
    rosterSnapshot: undefined,
    submittedAt: undefined,
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

function leagueWarlords(snapshots: readonly Roster[], legacy = false) {
  const selected = snapshots.flatMap((snapshot) => snapshot.built?.units.filter((unit) => unit.warlord) ?? [])
  return {
    count: selected.length,
    eligible: selected.every((unit) => unit.warlordEligible ?? (legacy || unit.group === 'character' || unit.group === 'epic-hero')),
  }
}

export const leagueCommand = spacetime.procedure({ payload: t.string() }, t.string(), (ctx, { payload }) =>
  ctx.withTx((tx) => {
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
          now: leagueTimeInput,
        }),
        value,
      )
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
      const full =
        league.admission === 'approval' && league.playerLimit !== undefined
          ? accepted >= league.playerLimit || entries.length >= input.memberLimit
          : entries.length >= (league.playerLimit ?? input.memberLimit)
      if (full) return productJson('full')
      const status = league.admission === 'automatic' || league.ownerId === input.userId ? 'accepted' : 'pending'
      if (existing) tx.db.leagueEventEntries.key.update({ ...existing, status, joinedAt: BigInt(input.now) })
      else
        tx.db.leagueEventEntries.insert({
          key,
          eventId: event.id,
          userId: input.userId,
          status,
          joinedAt: BigInt(input.now),
          rosterId: undefined,
          rosterName: undefined,
          rosterSnapshot: undefined,
          submittedAt: undefined,
          requiredLimit: undefined,
          teamId: undefined,
        })
      return productJson(status)
    }
    if (!league) return productJson(operation === 'reveal' ? { outcome: 'not-ready' } : 'missing')
    const ownerId = leagueCommandInput(z.object({ ownerId: leagueIdInput }), value).ownerId
    if (operation !== 'submit' && operation !== 'create-battle' && league.ownerId !== ownerId)
      return productJson(operation === 'reveal' ? { outcome: 'not-ready' } : 'forbidden')

    if (operation === 'create-event') {
      const input = leagueCommandInput(
        z.object({
          op: z.literal('create-event'),
          id: leagueIdInput,
          eventToken: leagueTokenInput,
          format: leagueFormatInput.nullable(),
          rosterLimit: z.number().int().positive().max(10_000).nullable(),
          now: leagueTimeInput,
        }),
        value,
      )
      if (input.format === '2v1' && league.playerLimit !== undefined && league.playerLimit < 3) return productJson('too-small')
      if (input.format === '2v2' && league.playerLimit !== undefined && (league.playerLimit < 4 || league.playerLimit % 2))
        return productJson('too-small')
      const latest = leagueEventFor(tx, league.id, null)
      if (!latest || latest.revealedAt === undefined) return productJson('open')
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
      return productJson('created')
    }
    if (operation === 'update') {
      const input = leagueCommandInput(leagueDetailsInput.extend({ op: z.literal('update') }), value)
      const current = leagueEventFor(tx, league.id, null)
      if (!current) return productJson('missing')
      const entries = leagueEntriesFor(tx, current.id)
      const accepted = entries.filter((entry) => entry.status === 'accepted').length
      if (input.playerLimit !== (league.playerLimit ?? null) && current.revealedAt === undefined) {
        if (current.format === '2v1' && input.playerLimit !== null && input.playerLimit < 3) return productJson('team-minimum')
        if (current.format === '2v2' && input.playerLimit !== null && (input.playerLimit < 4 || input.playerLimit % 2))
          return productJson('team-minimum')
        if (input.playerLimit !== null && input.playerLimit < accepted) return productJson('below-accepted')
      }
      tx.db.leagues.id.update({
        ...league,
        name: input.name,
        description: input.description,
        visibility: input.visibility,
        admission: input.admission,
        playerLimit: input.playerLimit ?? undefined,
      })
      const admitted: string[] = []
      if (input.admission === 'automatic' && league.admission === 'approval' && current.revealedAt === undefined) {
        const waiting = entries.filter((entry) => entry.status === 'pending')
        const places = input.playerLimit === null ? waiting.length : Math.max(0, input.playerLimit - accepted)
        for (const entry of waiting.slice(0, places)) {
          tx.db.leagueEventEntries.key.update({ ...entry, status: 'accepted' })
          admitted.push(entry.userId)
        }
      }
      return productJson({ admitted })
    }
    if (operation === 'delete') {
      deleteLeague(tx, league.id)
      return productJson('deleted')
    }
    if (operation === 'recurring') {
      if (!league.recurring) tx.db.leagues.id.update({ ...league, recurring: true })
      return productJson('updated')
    }
    const eventToken = leagueCommandInput(z.object({ eventToken: z.string().max(128) }), value).eventToken
    const event = leagueEventFor(tx, league.id, eventToken || null)
    if (!event) return productJson(operation === 'reveal' ? { outcome: 'not-ready' } : 'missing')
    if (operation === 'update-event') {
      const input = leagueCommandInput(leagueRuleInput.extend({ op: z.literal('update-event') }), value)
      if (input.format === '2v1' && league.playerLimit !== undefined && league.playerLimit < 3) return productJson('too-small')
      if (input.format === '2v2' && league.playerLimit !== undefined && (league.playerLimit < 4 || league.playerLimit % 2))
        return productJson('too-small')
      if (event.revealedAt !== undefined) return productJson('closed')
      const entries = leagueEntriesFor(tx, event.id)
      if (entries.some((entry) => entry.rosterSnapshot !== undefined)) return productJson('sealed')
      tx.db.leagueEvents.id.update({ ...event, format: input.format, rosterLimit: input.rosterLimit })
      for (const entry of entries) tx.db.leagueEventEntries.key.update({ ...entry, requiredLimit: undefined, teamId: undefined })
      return productJson('updated')
    }
    if (operation === 'moderate') {
      const input = leagueCommandInput(
        z.object({
          op: z.literal('moderate'),
          userId: leagueIdInput,
          status: z.enum(['accepted', 'rejected']),
          memberLimit: z.number().int().min(2).max(128),
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
      return productJson(input.status === 'accepted' && entry.status !== 'accepted' ? 'admitted' : 'updated')
    }
    if (operation === 'assign-limit') {
      const input = leagueCommandInput(
        z.object({
          op: z.literal('assign-limit'),
          userId: leagueIdInput,
          requiredLimit: z.number().int().positive().max(10_000),
        }),
        value,
      )
      if (event.revealedAt !== undefined) return productJson('closed')
      if (event.format !== '2v1') return productJson('wrong-format')
      if (input.requiredLimit !== event.rosterLimit && input.requiredLimit !== alliedLeagueRosterLimit(event.rosterLimit ?? 0))
        return productJson('wrong-limit')
      const entry = tx.db.leagueEventEntries.key.find(JSON.stringify([event.id, input.userId]))
      if (!entry || entry.status !== 'accepted') return productJson('missing')
      if (entry.requiredLimit !== input.requiredLimit) {
        tx.db.leagueEventEntries.key.update({
          ...entry,
          requiredLimit: input.requiredLimit,
          rosterId: undefined,
          rosterName: undefined,
          rosterSnapshot: undefined,
          submittedAt: undefined,
        })
      }
      return productJson('updated')
    }
    if (operation === 'assign-team') {
      const input = leagueCommandInput(
        z.object({
          op: z.literal('assign-team'),
          userIds: z.array(leagueIdInput).min(1).max(2),
          teamId: leagueIdInput,
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
      if (userIds.length === 2 && previousTeamId && targets.every((entry) => entry.teamId === previousTeamId)) return productJson('updated')
      const oldTeams = new Set(targets.map((entry) => entry.teamId).filter((id) => id !== undefined))
      const affected = entries.filter((entry) => userIds.includes(entry.userId) || (entry.teamId && oldTeams.has(entry.teamId)))
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
      return productJson('updated')
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
      return productJson({ outcome: 'sealed', format: event.format ?? null, requiredLimit })
    }
    if (operation === 'reveal') {
      const input = leagueCommandInput(z.object({ op: z.literal('reveal'), now: leagueTimeInput }), value)
      if (event.revealedAt !== undefined) return productJson({ outcome: 'not-ready' })
      const all = leagueEntriesFor(tx, event.id)
      const entries = all.filter((entry) => entry.status === 'accepted')
      if (
        !entries.length ||
        (league.playerLimit !== undefined && entries.length !== league.playerLimit) ||
        entries.some((entry) => entry.rosterSnapshot === undefined || (event.format === '2v1' && entry.requiredLimit === undefined))
      )
        return productJson({ outcome: 'not-ready' })
      let snapshots: Roster[] = []
      if (event.format !== undefined) {
        try {
          snapshots = entries.map((entry) => parseRosterSnapshot(entry.rosterSnapshot!))
        } catch {
          return productJson({ outcome: 'not-ready' })
        }
      }
      if (event.format === '2v1') {
        const solo = entries.filter((entry) => entry.requiredLimit === event.rosterLimit).length
        const allied = entries.filter((entry) => entry.requiredLimit === alliedLeagueRosterLimit(event.rosterLimit ?? 0)).length
        if (!solo || allied < 2) return productJson({ outcome: 'not-ready' })
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
        if (entries.length < 4 || entries.length % 2 || entries.some((entry) => entry.teamId === undefined))
          return productJson({ outcome: 'not-ready' })
        const teams = new Map<string, Roster[]>()
        entries.forEach((entry, index) => teams.set(entry.teamId!, [...(teams.get(entry.teamId!) ?? []), snapshots[index]!]))
        if (teams.size < 2 || [...teams.values()].some((team) => team.length !== 2)) return productJson({ outcome: 'not-ready' })
        if (
          [...teams.values()].some((team) => {
            const selected = leagueWarlords(team)
            return !selected.eligible || selected.count !== 1
          })
        )
          return productJson({ outcome: 'invalid-warlords', format: '2v2' })
        if (all.some((entry) => entry.status === 'pending')) return productJson({ outcome: 'not-ready' })
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
      for (const entry of all.filter((row) => row.status === 'pending'))
        tx.db.leagueEventEntries.key.update({ ...entry, status: 'rejected' })
      tx.db.leagueEvents.id.update({ ...event, revealedAt: BigInt(input.now) })
      return productJson({ outcome: 'revealed', entrantIds: entries.map((entry) => entry.userId) })
    }
    if (operation === 'unseal') {
      const input = leagueCommandInput(z.object({ op: z.literal('unseal'), userId: leagueIdInput }), value)
      if (event.revealedAt === undefined) return productJson('not-revealed')
      const entry = tx.db.leagueEventEntries.key.find(JSON.stringify([event.id, input.userId]))
      if (!entry || entry.status !== 'accepted' || entry.rosterSnapshot === undefined) return productJson('missing')
      resetLeagueEntry(tx, entry)
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
      return productJson(true)
    }
    throw new SenderError('Unknown league command')
  }),
)

const epochColumns = new Set([
  'at',
  'createdAt',
  'updatedAt',
  'joinedAt',
  'requestedAt',
  'acceptedAt',
  'lastSeenAt',
  'submittedAt',
  'revealedAt',
])

function importRow(ctx: Context, name: string, source: Record<string, unknown>) {
  const row = Object.fromEntries(
    Object.entries(source).map(([column, value]) => {
      const field = column.replaceAll(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())
      return [field, value === null ? undefined : epochColumns.has(field) ? BigInt(value as string | number) : value]
    }),
  )
  switch (name) {
    case 'user_onboarding':
      ctx.db.userOnboarding.insert(row as Parameters<typeof ctx.db.userOnboarding.insert>[0])
      break
    case 'user_onboarding_tasks':
      ctx.db.userOnboardingTasks.insert(row as Parameters<typeof ctx.db.userOnboardingTasks.insert>[0])
      break
    case 'battles':
      ctx.db.battles.insert(row as Parameters<typeof ctx.db.battles.insert>[0])
      break
    case 'battle_users':
      ctx.db.battleUsers.insert(row as Parameters<typeof ctx.db.battleUsers.insert>[0])
      break
    case 'battle_sharing':
      ctx.db.battleSharing.insert(row as Parameters<typeof ctx.db.battleSharing.insert>[0])
      break
    case 'push_preferences':
      ctx.db.pushPreferences.insert(row as Parameters<typeof ctx.db.pushPreferences.insert>[0])
      break
    case 'push_tokens':
      ctx.db.pushTokens.insert(row as Parameters<typeof ctx.db.pushTokens.insert>[0])
      break
    case 'friendships':
      ctx.db.friendships.insert(row as Parameters<typeof ctx.db.friendships.insert>[0])
      break
    case 'friend_invites':
      ctx.db.friendInvites.insert(row as Parameters<typeof ctx.db.friendInvites.insert>[0])
      break
    case 'commands':
      ctx.db.commands.insert(row as Parameters<typeof ctx.db.commands.insert>[0])
      break
    case 'rosters':
      ctx.db.rosters.insert(row as Parameters<typeof ctx.db.rosters.insert>[0])
      break
    case 'leagues':
      ctx.db.leagues.insert(row as Parameters<typeof ctx.db.leagues.insert>[0])
      break
    case 'league_events':
      ctx.db.leagueEvents.insert(row as Parameters<typeof ctx.db.leagueEvents.insert>[0])
      break
    case 'league_event_entries':
      ctx.db.leagueEventEntries.insert(row as Parameters<typeof ctx.db.leagueEventEntries.insert>[0])
      break
    case 'league_event_battles':
      ctx.db.leagueEventBattles.insert(row as Parameters<typeof ctx.db.leagueEventBattles.insert>[0])
      break
    case 'collection':
      ctx.db.collection.insert(row as Parameters<typeof ctx.db.collection.insert>[0])
      break
    case 'favourite_factions':
      ctx.db.favouriteFactions.insert(row as Parameters<typeof ctx.db.favouriteFactions.insert>[0])
      break
    case 'favourite_detachments':
      ctx.db.favouriteDetachments.insert(row as Parameters<typeof ctx.db.favouriteDetachments.insert>[0])
      break
    case 'practice_opponents':
      ctx.db.practiceOpponents.insert(row as Parameters<typeof ctx.db.practiceOpponents.insert>[0])
      break
    default:
      throw new SenderError('Unknown product table')
  }
}

export const importProductBatch = spacetime.reducer({ name: t.string(), rows: t.string() }, (ctx, { name, rows }) => {
  const configured = ctx.db.settings.id.find(0)
  if (!configured?.owner.isEqual(ctx.sender)) throw new SenderError('Database owner required')
  if (rows.length > 2_100_000) throw new SenderError('Product batch is too large')
  const parsed: unknown = JSON.parse(rows)
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 100) throw new SenderError('Invalid product batch')
  for (const row of parsed) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new SenderError('Invalid product row')
    importRow(ctx, name, row as Record<string, unknown>)
  }
})
