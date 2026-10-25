import { ScheduleAt } from 'spacetimedb'
import { SenderError, schema, table, t, type InferSchema, type ReducerCtx } from 'spacetimedb/server'
import { detachmentIds, ROSTER_SOURCES, ROSTER_VISIBILITIES } from '../../src/core/savedRoster'
import { migrateStoredRoster } from '../../src/core/savedRosterMigrations'
import { LOCKED_ROSTER_MESSAGE, lockedRosterRefusal, storedRosterContent } from '../../src/core/rosterLock'
import { listUnitCount } from '../../src/core/attachedUnits'
import { ROSTER_LIBRARY_BATCH_SIZE } from '../../src/core/rosterLibrary'
import { orderVariantGroup } from '../../src/core/rosterVariants'
import { discoveryPage, rosterDiscoveryQuerySchema } from '../../src/core/rosterDiscovery'
import { MAX_DATASHEET_PHOTOS, rankCollectionPhotos } from '../../src/core/collectionPhotos'
import { DEFAULT_PUSH_NOTIFICATIONS, PUSH_TOKENS_PER_USER, PUSH_PLATFORMS } from '../../src/core/notificationConfig'
import {
  customPointsBudget,
  POINTS_BUDGET_MAX,
  POINTS_BUDGET_MIN,
  pointsBudgetError,
  reduceBattle,
  validate,
  type FormatRuleId,
  type LoggedCommand,
} from '../../src/core/battle'
import { commandSchema } from '../../src/core/commands'
import { teamDispositionChoices } from '../../src/core/teamDisposition'
import { DEFAULT_PLAYER_DEFAULTS, isPlayerDefaults } from '../../src/core/playerDefaults'
import { matchupPairingSchema, RECENT_MATCHUP_LIMIT, recentMatchupSchema } from '../../src/core/recentMatchups'
import { onboardingTaskIds, tourTaskIds } from '../../src/core/onboarding'
import {
  alliedLeagueRosterLimit,
  leagueAllowancesSchema,
  parseLeagueAllowances,
  leagueAllowanceRefusal,
  leaguePlacesSeat,
  leagueWarlordValid,
  leagueWarlordWaived,
  leagueRegistrationFull,
  leagueRevealChecklist,
  leagueSealingClosed,
  leagueTeams,
  mayRevealLeague,
  isLeagueOrganizer,
  LEAGUE_ADMIN_MAX,
  LEAGUE_ADMISSIONS,
  LEAGUE_VISIBILITIES,
  type LeagueEntryStatus,
  matchesSealedLeagueRoster,
  requiredLeagueRosterLimit,
} from '../../src/core/league'
import { parseRosterSnapshot, rosterPickSchema } from '../../src/core/commands'
import { SWISS_ROUNDS_MAX } from '../../src/core/swiss'
import {
  CLUB_ADMIN_MAX,
  CLUB_DESCRIPTION_MAX_LENGTH,
  CLUB_MEMBER_MAX,
  CLUB_NAME_MAX_LENGTH,
  isClubOrganizer,
  type ClubMemberStatus,
  type ClubRole,
} from '../../src/core/club'
import { admitConnection, authConfiguration } from './admission'
import {
  ABILITY_REMINDERS_MAX,
  abilityReminderSchema,
  abilityRemindersFromRosters,
  legacyAbilityKey,
  ROSTER_REMINDERS_MAX,
  rosterReminderSchema,
} from '../../src/core/reminders'
import { boundedProgress, countsAsList, MAX_COLLECTION_MODELS, MAX_COLLECTION_DATASHEETS, MAX_COUNTS_AS } from '../../src/core/collection'
import { TABLE_SHAPES, type TableShape } from '../../src/core/tableShape'
import { guestSeatId, isGuestSeat } from '../../src/core/newBattle'
import { claimedLog, guestClaimRefusal, guestDeviceSubject, guestSessionCurrent } from '../../src/core/guestSession'
import { PROFILE_NAME_MAX_LENGTH } from '../../src/core/profileName'
import type { Roster } from '../../src/core/battle'
import { z } from 'zod'
import { productTables } from './productSchema'
import { UNIT_LOADOUTS_MAX, unitLoadoutNameSchema, unitLoadoutSchema } from '../../src/core/unitLoadouts'
import { productSyncRefusal } from './syncOutcome'

// Auth settings live in the module environment; the issuer, audience and operator columns stay
// because automatic migration cannot remove columns.
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

const spacetime = schema(
  {
    settings,
    sessionAccess,
    adminSessions,
    adminRevisions,
    revokedSession,
    accessExpiry,
    revocationExpiry,
    watchedBattles,
    ...productTables,
  },
  { env: { AUTH_ISSUER: t.string(), AUTH_AUDIENCE: t.string(), OPERATOR_IDENTITY: t.string() } },
)
export default spacetime

type Context = ReducerCtx<InferSchema<typeof spacetime>>

const MAX_TOKEN_SECONDS = 600n
const MAX_ID_LENGTH = 128

const idInput = z.string().min(1).max(MAX_ID_LENGTH)

function validId(value: string) {
  return value.length > 0 && value.length <= MAX_ID_LENGTH
}

/** Parses caller JSON against `inputSchema`, refusing malformed or invalid input with `message`. */
function decodePayload<S extends z.ZodType>(inputSchema: S, text: string, message: string): z.output<S> {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new SenderError(message)
  }
  const parsed = inputSchema.safeParse(value)
  if (!parsed.success) throw new SenderError(message)
  return parsed.data
}

function nowSeconds(ctx: Context) {
  return ctx.timestamp.microsSinceUnixEpoch / 1_000_000n
}

function revoke(ctx: Context, subject: string) {
  if (!validId(subject)) throw new SenderError('Invalid session')
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

function auth(ctx: Context) {
  try {
    return authConfiguration(ctx.env)
  } catch {
    throw new SenderError('Invalid auth configuration')
  }
}

function requireOperator(ctx: Context) {
  if (ctx.sender.toHexString() !== auth(ctx).operator) throw new SenderError('Operator required')
}

const ROSTER_LOANS_PER_ROSTER = 100

type ProductScope =
  | 'rosters'
  | 'collection'
  | 'favourites'
  | 'friends'
  | 'invites'
  | 'onboarding'
  | 'settings'
  | 'leagues'
  | 'clubs'
  | 'battles'
  | 'simulator'

function touchProduct(ctx: Context, userId: string, ...scopes: ProductScope[]) {
  // Nobody signs in as a guest, so nobody would ever read its revisions or delete them with an account.
  if (isGuestSeat(userId)) return
  for (const scope of scopes) {
    const key = JSON.stringify([userId, scope])
    const current = ctx.db.productRevisions.key.find(key)
    if (current) ctx.db.productRevisions.key.update({ ...current, revision: current.revision + 1n })
    else ctx.db.productRevisions.insert({ key, userId, scope, revision: 1n })
  }
}

type PublicScope = 'collection' | 'battles' | 'rosters' | 'leagues' | 'clubs' | 'invites' | 'standings' | 'opponents'

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

type RosterLoan = NonNullable<ReturnType<Context['db']['rosterLoans']['key']['find']>>

function endLoan(ctx: Context, loan: RosterLoan) {
  ctx.db.rosterLoans.key.delete(loan.key)
  touchProduct(ctx, loan.ownerId, 'rosters')
  touchProduct(ctx, loan.borrowerId, 'rosters')
}

function endLoans(ctx: Context, rosterId: string) {
  for (const loan of Array.from(ctx.db.rosterLoans.rosterId.filter(rosterId))) endLoan(ctx, loan)
}

function touchBorrowers(ctx: Context, rosterId: string) {
  for (const loan of ctx.db.rosterLoans.rosterId.filter(rosterId)) touchProduct(ctx, loan.borrowerId, 'rosters')
}

/** A loan lasts only while the two players stay friends, so a removed friendship also ends it at the next read. */
function activeLoan(ctx: Context, rosterId: string, borrowerId: string) {
  const loan = ctx.db.rosterLoans.key.find(JSON.stringify([rosterId, borrowerId]))
  return loan && friendshipBetween(ctx, loan.ownerId, borrowerId)?.acceptedAt !== undefined ? loan : undefined
}

function touchLeague(ctx: Context, leagueId: string, eventId?: string) {
  const league = ctx.db.leagues.id.find(leagueId)
  if (!league) return
  const users = new Set([league.ownerId, ...leagueAdminIds(ctx, leagueId)])
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
  for (const row of Array.from(ctx.db.guestSeats.battleId.filter(battleId))) ctx.db.guestSeats.seatId.delete(row.seatId)
  // A deleted table battle frees its pairing, so the two players can start it again.
  if (leagueEvent)
    for (const pairing of Array.from(ctx.db.leagueRoundPairings.eventId.filter(leagueEvent.eventId)))
      if (pairing.battleId === battleId) ctx.db.leagueRoundPairings.key.update({ ...pairing, battleId: undefined })
  ctx.db.leagueEventBattles.battleId.delete(battleId)
  ctx.db.clubBattles.battleId.delete(battleId)
  ctx.db.battles.id.delete(battleId)
}

function deleteLeague(ctx: Context, leagueId: string) {
  touchLeague(ctx, leagueId)
  for (const event of Array.from(ctx.db.leagueEvents.leagueId.filter(leagueId))) {
    for (const row of Array.from(ctx.db.leagueRosterSharing.eventId.filter(event.id))) ctx.db.leagueRosterSharing.key.delete(row.key)
    for (const row of Array.from(ctx.db.leagueEventEntries.eventId.filter(event.id))) ctx.db.leagueEventEntries.key.delete(row.key)
    clearTeamPicks(ctx, event.id)
    for (const row of Array.from(ctx.db.leagueEventBattles.eventId.filter(event.id)))
      ctx.db.leagueEventBattles.battleId.delete(row.battleId)
    for (const row of Array.from(ctx.db.leagueRoundPairings.eventId.filter(event.id))) ctx.db.leagueRoundPairings.key.delete(row.key)
    ctx.db.leagueEvents.id.delete(event.id)
  }
  for (const row of Array.from(ctx.db.leagueAdmins.leagueId.filter(leagueId))) ctx.db.leagueAdmins.key.delete(row.key)
  ctx.db.leagues.id.delete(leagueId)
}

function touchClub(ctx: Context, clubId: string) {
  const club = ctx.db.clubs.id.find(clubId)
  if (!club) return
  touchProduct(ctx, club.ownerId, 'clubs')
  for (const member of ctx.db.clubMembers.clubId.filter(clubId)) touchProduct(ctx, member.userId, 'clubs')
  touchPublic(ctx, 'clubs')
}

const CLUB_MEMBERS_ONLY = 'every player must be a member of the club'

/** A club's tournaments, newest first. Few leagues exist, so a scan stands in for an index on an optional column. */
function clubTournaments(ctx: Context, clubId: string) {
  return Array.from(ctx.db.leagues.iter())
    .filter((league) => league.clubId === clubId)
    .sort((a, b) => Number(b.createdAt - a.createdAt))
}

/** Battles that count for a club: those tagged for it, and those its tournaments started. */
function* clubBattleIds(ctx: Context, clubId: string) {
  for (const row of ctx.db.clubBattles.clubId.filter(clubId)) yield row.battleId
  for (const league of clubTournaments(ctx, clubId))
    for (const event of ctx.db.leagueEvents.leagueId.filter(league.id))
      for (const row of ctx.db.leagueEventBattles.eventId.filter(event.id)) yield row.battleId
}

/** Clubs every seat belongs to, none of them a guest or practice opponent: the clubs this battle may count for. */
function battleClubIds(ctx: Context, seats: readonly { id: string; automated: boolean }[]) {
  if (seats.some((seat) => seat.automated || isGuestSeat(seat.id))) return []
  const [first, ...rest] = seats
  if (!first) return []
  return Array.from(ctx.db.clubMembers.userId.filter(first.id))
    .filter((row) => row.status === 'accepted')
    .map((row) => row.clubId)
    .filter((clubId) => rest.every((seat) => ctx.db.clubMembers.key.find(JSON.stringify([clubId, seat.id]))?.status === 'accepted'))
}

/** Rewrites a battle's club index row from its log, so a choice and its undo both land in the index. */
function indexClubBattle(ctx: Context, battleId: string) {
  const { seats, log } = battleData(ctx, battleId)
  const clubId = reduceBattle(
    seats.map((seat) => seat.id),
    log,
    seats.map((seat) => seat.side),
    seats.filter((seat) => seat.automated).map((seat) => seat.id),
  ).clubId
  ctx.db.clubBattles.battleId.delete(battleId)
  if (clubId) ctx.db.clubBattles.insert({ battleId, clubId })
}

function deleteClub(ctx: Context, clubId: string) {
  touchClub(ctx, clubId)
  for (const row of Array.from(ctx.db.clubMembers.clubId.filter(clubId))) ctx.db.clubMembers.key.delete(row.key)
  for (const row of Array.from(ctx.db.clubBattles.clubId.filter(clubId))) ctx.db.clubBattles.battleId.delete(row.battleId)
  for (const league of clubTournaments(ctx, clubId)) ctx.db.leagues.id.update({ ...league, clubId: undefined })
  ctx.db.clubs.id.delete(clubId)
}

function leagueAdminIds(ctx: Context, leagueId: string) {
  return Array.from(ctx.db.leagueAdmins.leagueId.filter(leagueId), (row) => row.userId)
}

export const init = spacetime.init((ctx) => {
  auth(ctx)
  ctx.db.settings.insert({ id: 0, owner: ctx.sender, operator: '', issuer: '', audience: '' })
})

export const onConnect = spacetime.clientConnected((ctx) => {
  const { issuer, audience, operator } = auth(ctx)
  const admission = admitConnection({
    trusted: ctx.db.settings.id.find(0)?.owner.isEqual(ctx.sender) || operator === ctx.sender.toHexString(),
    senderHex: ctx.sender.toHexString(),
    jwt: ctx.senderAuth.jwt,
    issuer,
    audience,
    now: nowSeconds(ctx),
    maxTokenSeconds: MAX_TOKEN_SECONDS,
    isRevoked: (subject) => Boolean(ctx.db.revokedSession.subject.find(subject)),
    holdsGuestSeat: (seatId, subject) => {
      const device = ctx.db.guestSeats.seatId.find(seatId)
      return (
        device?.deviceHash !== undefined &&
        device.joinedAt !== undefined &&
        guestDeviceSubject(device.deviceHash) === subject &&
        guestSessionCurrent(safeNumber(device.joinedAt), safeNumber(ctx.timestamp.microsSinceUnixEpoch / 1_000n))
      )
    },
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
  if (!validId(userId)) throw new SenderError('Invalid user ID')
  for (const row of Array.from(ctx.db.sessionAccess.userId.filter(userId))) revoke(ctx, row.subject)
  for (const row of Array.from(ctx.db.battleUsers.userId.filter(userId))) deleteBattle(ctx, row.battleId)
  for (const row of Array.from(ctx.db.leagues.ownerId.filter(userId))) deleteLeague(ctx, row.id)
  for (const row of Array.from(ctx.db.clubs.ownerId.filter(userId))) deleteClub(ctx, row.id)
  for (const row of Array.from(ctx.db.clubMembers.userId.filter(userId))) {
    ctx.db.clubMembers.key.delete(row.key)
    touchClub(ctx, row.clubId)
  }
  for (const row of Array.from(ctx.db.leagueAdmins.userId.filter(userId))) {
    ctx.db.leagueAdmins.key.delete(row.key)
    touchLeague(ctx, row.leagueId)
  }
  for (const row of Array.from(ctx.db.userOnboardingTasks.userId.filter(userId))) ctx.db.userOnboardingTasks.key.delete(row.key)
  ctx.db.userOnboarding.userId.delete(userId)
  ctx.db.pushPreferences.userId.delete(userId)
  ctx.db.playerDefaults.userId.delete(userId)
  for (const row of Array.from(ctx.db.leagueRosterSharing.userId.filter(userId))) ctx.db.leagueRosterSharing.key.delete(row.key)
  touchPublic(ctx, 'collection')
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
  for (const row of Array.from(ctx.db.rosterLoans.borrowerId.filter(userId))) endLoan(ctx, row)
  const ownedRosters = Array.from(ctx.db.rosters.userId.filter(userId))
  for (const row of ownedRosters) {
    if (row.visibility !== 'private') touchPublic(ctx, 'rosters')
    endLoans(ctx, row.id)
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
  for (const row of Array.from(ctx.db.collectionPhotos.userId.filter(userId))) dropCollectionPhoto(ctx, row)
  for (const row of Array.from(ctx.db.collectionPhotoLikes.userId.filter(userId))) setLike(ctx, row.photoId, userId, false, 0n)
  for (const row of Array.from(ctx.db.collection.userId.filter(userId))) ctx.db.collection.key.delete(row.key)
  for (const row of Array.from(ctx.db.collectionWishes.userId.filter(userId))) ctx.db.collectionWishes.key.delete(row.key)
  for (const row of Array.from(ctx.db.collectionStock.userId.filter(userId))) ctx.db.collectionStock.key.delete(row.key)
  for (const row of Array.from(ctx.db.favouriteFactions.userId.filter(userId))) ctx.db.favouriteFactions.key.delete(row.key)
  for (const row of Array.from(ctx.db.favouriteDetachments.userId.filter(userId))) ctx.db.favouriteDetachments.key.delete(row.key)
  for (const row of Array.from(ctx.db.favouriteDatasheets.userId.filter(userId))) ctx.db.favouriteDatasheets.key.delete(row.key)
  for (const row of Array.from(ctx.db.unitLoadouts.userId.filter(userId))) ctx.db.unitLoadouts.id.delete(row.id)
  for (const row of Array.from(ctx.db.recentMatchups.userId.filter(userId))) ctx.db.recentMatchups.key.delete(row.key)
  for (const row of Array.from(ctx.db.abilityReminders.userId.filter(userId))) ctx.db.abilityReminders.key.delete(row.key)
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
  const written = Array.from(ctx.db.commands.battleId.filter(battleId))
    .sort((left, right) => left.seq - right.seq)
    .flatMap((row): LoggedCommand[] => {
      const body: unknown = JSON.parse(row.body)
      const command = commandSchema.safeParse(body)
      const metadata = (body as { $sync?: { operationId?: string } }).$sync
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
  // Every product read of a battle passes through here, so no reader sees a claimed guest seat by its old name.
  const log = claimedLog(
    written,
    seats.flatMap((seat) => (seat.claimedSeat === undefined ? [] : [{ seatId: seat.claimedSeat, userId: seat.userId }])),
  )
  return {
    battle,
    seats: seats.map((seat) => ({
      id: seat.userId,
      side: seat.side,
      // A guest who joined on their own device plays their side; until then, or once the host takes it back, the table does.
      automated:
        seat.guestName !== undefined
          ? ctx.db.guestSeats.seatId.find(seat.userId)?.deviceHash === undefined
          : Boolean(ctx.db.practiceOpponents.userId.find(seat.userId)),
      ...(seat.guestName !== undefined ? { guestName: seat.guestName } : {}),
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
  id: idInput,
  token: idInput,
  userId: idInput,
  allyIds: z.array(idInput).max(3),
  opponentIds: z.array(idInput).max(3),
  guestNames: z.array(z.string().trim().min(1).max(PROFILE_NAME_MAX_LENGTH)).max(2).default([]),
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
  scope: z.enum(['user', 'league', 'club', 'public', 'friends', 'watchable', 'profile']),
  userId: z.string().max(MAX_ID_LENGTH).nullable(),
  viewerId: z.string().max(MAX_ID_LENGTH).nullable(),
  withUserId: z.string().max(MAX_ID_LENGTH).nullable(),
  leagueToken: z.string().max(MAX_ID_LENGTH).nullable(),
  eventToken: z.string().max(MAX_ID_LENGTH).nullable(),
  // Sent only with the club scope, so a server older than clubs still reads every other feed.
  clubToken: z.string().max(MAX_ID_LENGTH).optional(),
  since: z.number().int().nonnegative().nullable(),
  before: z.strictObject({ at: z.number().int().nonnegative(), id: z.string().max(MAX_ID_LENGTH) }).nullable(),
  limit: z.number().int().min(1).max(500),
})

export const battleFeed = spacetime.procedure({ payload: t.string() }, t.string(), (ctx, { payload }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (payload.length > 2_000) throw new SenderError('Invalid battle feed')
    const input = decodePayload(battleFeedQuery, payload, 'Invalid battle feed')
    if (
      ((input.scope === 'user' || input.scope === 'friends' || input.scope === 'profile') && !input.userId) ||
      (input.scope === 'league' && (!input.leagueToken || !input.eventToken)) ||
      (input.scope === 'club' && !input.clubToken) ||
      (input.scope === 'watchable' && input.since === null)
    ) {
      throw new SenderError('Invalid battle feed scope')
    }

    const league = input.leagueToken ? tx.db.leagues.token.find(input.leagueToken) : undefined
    const event = input.eventToken ? tx.db.leagueEvents.token.find(input.eventToken) : undefined
    if (input.scope === 'league' && (!league || !event || event.leagueId !== league.id || event.revealedAt === undefined)) {
      return productJson({ battles: [], nextCursor: null })
    }
    const club = input.clubToken ? tx.db.clubs.token.find(input.clubToken) : undefined
    if (input.scope === 'club' && !club) return productJson({ battles: [], nextCursor: null })
    const friendIds = input.scope === 'friends' ? acceptedFriendIds(tx, input.userId!) : new Set<string>()

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
      } else if (input.scope === 'club') {
        for (const battleId of clubBattleIds(tx, club!.id)) {
          const battle = tx.db.battles.id.find(battleId)
          if (battle) yield battle
        }
      } else yield* tx.db.battles.iter()
    }
    for (const battle of candidates()) {
      const seats = Array.from(tx.db.battleUsers.battleId.filter(battle.id))
      const seatIds = new Set(seats.map((seat) => seat.userId))
      const hasPractice = seats.some((seat) => Boolean(tx.db.practiceOpponents.userId.find(seat.userId)))
      if (input.scope === 'user' && (!seatIds.has(input.userId!) || (input.withUserId && !seatIds.has(input.withUserId)))) continue
      if (input.scope === 'league' && tx.db.leagueEventBattles.battleId.find(battle.id)?.eventId !== event!.id) continue
      if (input.scope === 'public' && (hasPractice || (input.viewerId && seatIds.has(input.viewerId)))) continue
      if (input.scope === 'friends' && (hasPractice || seatIds.has(input.userId!) || !seats.some((seat) => friendIds.has(seat.userId))))
        continue
      if (input.scope === 'profile' && !seatIds.has(input.userId!)) continue
      let activity = battle.createdAt
      if (input.scope !== 'public' && input.scope !== 'friends') {
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
      const raw = decodePayload(
        z.looseObject({
          $sync: z
            .object({
              operationId: z.uuid(),
              fingerprint: z.string().length(64),
              at: z.number().int().nonnegative(),
              reportApplied: z.boolean().optional(),
            })
            .optional(),
        }),
        input.body,
        'Invalid battle command',
      )
      const sync = raw.$sync
      const parsed = commandSchema.safeParse(raw)
      if (!parsed.success) throw new SenderError('Invalid battle command')
      const { seats, log } = battleData(tx, input.battleId)
      const appliedReport = sync?.reportApplied ? { applied: false } : {}
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
          return productJson({ result: { outcome: 'appended', seq: previous.seq }, log, ...appliedReport })
        }
      }
      if (input.expectedSeq !== state.seq) return productJson({ result: { outcome: 'stale', seq: state.seq }, log, ...appliedReport })
      const refusal =
        validate(state, input.userId, parsed.data) ??
        (parsed.data.kind === 'set-battle-club' && parsed.data.clubId && !battleClubIds(tx, seats).includes(parsed.data.clubId)
          ? CLUB_MEMBERS_ONLY
          : null)
      if (refusal) return productJson({ result: { outcome: 'refused', reason: refusal }, log, ...appliedReport })
      if (input.externalRefusal) {
        if (input.externalRefusal.length > 1_000) throw new SenderError('Invalid battle refusal')
        return productJson({ result: { outcome: 'refused', reason: input.externalRefusal }, log, ...appliedReport })
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
      if (parsed.data.kind === 'set-battle-club' || parsed.data.kind === 'undo') indexClubBattle(tx, input.battleId)
      return productJson({
        result: { outcome: 'appended', seq },
        ...(sync?.reportApplied ? { applied: true } : {}),
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

function guestSeatIn(ctx: Context, battleId: string, seatId: string) {
  const seat = ctx.db.battleUsers.key.find(JSON.stringify([battleId, seatId]))
  if (seat?.guestName === undefined) throw new SenderError('Invalid guest seat')
  return seat
}

/** The link a host shares for a guest seat, made the first time it is asked for and kept until the host replaces it. */
export const guestInvite = spacetime.procedure({ battleId: t.string(), seatId: t.string(), invite: t.string() }, t.string(), (ctx, input) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    guestSeatIn(tx, input.battleId, input.seatId)
    const current = tx.db.guestSeats.seatId.find(input.seatId)
    if (current) return productJson(current.invite)
    if (!validId(input.invite)) throw new SenderError('Invalid invite')
    tx.db.guestSeats.insert({
      seatId: input.seatId,
      battleId: input.battleId,
      invite: input.invite,
      deviceHash: undefined,
      joinedAt: undefined,
    })
    return productJson(input.invite)
  }),
)

/** A new link that retires the old one and any device that joined through it, so the table plays the seat again. */
export const replaceGuestInvite = spacetime.procedure(
  { battleId: t.string(), seatId: t.string(), invite: t.string() },
  t.string(),
  (ctx, input) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      guestSeatIn(tx, input.battleId, input.seatId)
      if (!validId(input.invite)) throw new SenderError('Invalid invite')
      tx.db.guestSeats.seatId.delete(input.seatId)
      tx.db.guestSeats.insert({
        seatId: input.seatId,
        battleId: input.battleId,
        invite: input.invite,
        deviceHash: undefined,
        joinedAt: undefined,
      })
      endGuestSessions(tx, input.seatId)
      touchBattleSeats(tx, input.battleId)
      return productJson(input.invite)
    }),
)

export const guestSeatByInvite = spacetime.procedure({ invite: t.string() }, t.string(), (ctx, { invite }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    const row = tx.db.guestSeats.invite.find(invite)
    const battle = row && tx.db.battles.id.find(row.battleId)
    if (!row || !battle) return productJson(null)
    const seats = Array.from(tx.db.battleUsers.battleId.filter(row.battleId))
    return productJson({
      battleId: battle.id,
      token: battle.token,
      seatId: row.seatId,
      guestName: seats.find((seat) => seat.userId === row.seatId)?.guestName ?? '',
      hostId: seats.find((seat) => seat.side === 0 && seat.guestName === undefined)?.userId ?? null,
      joined: row.deviceHash !== undefined,
    })
  }),
)

/** The first device to open a link takes the seat; a second device finds it taken until the host shares a new link. */
export const joinGuestSeat = spacetime.procedure({ invite: t.string(), deviceHash: t.string(), now: t.u64() }, t.string(), (ctx, input) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (!/^[0-9a-f]{64}$/.test(input.deviceHash)) throw new SenderError('Invalid guest device')
    const row = tx.db.guestSeats.invite.find(input.invite)
    const battle = row && tx.db.battles.id.find(row.battleId)
    if (!row || !battle) return productJson('missing')
    if (row.deviceHash !== undefined) return productJson('taken')
    tx.db.guestSeats.seatId.update({ ...row, deviceHash: input.deviceHash, joinedAt: input.now })
    touchBattleSeats(tx, row.battleId)
    return productJson({ battleId: battle.id, token: battle.token, seatId: row.seatId })
  }),
)

export const guestDevice = spacetime.procedure({ seatId: t.string() }, t.string(), (ctx, { seatId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    const row = tx.db.guestSeats.seatId.find(seatId)
    const battle = row && tx.db.battles.id.find(row.battleId)
    if (!row?.deviceHash || row.joinedAt === undefined || !battle) return productJson(null)
    return productJson({ battleId: battle.id, token: battle.token, deviceHash: row.deviceHash, joinedAt: safeNumber(row.joinedAt) })
  }),
)

/**
 * Seats the account the guest signed up with in a finished battle's guest seat. The log keeps the seat it was written
 * with and `battleData` reads it as the account, so the battle folds as one between accounts. The device must still
 * hold the seat, so only the guest can claim it.
 */
export const claimGuestSeat = spacetime.procedure(
  { battleId: t.string(), seatId: t.string(), userId: t.string(), deviceHash: t.string(), now: t.u64() },
  t.string(),
  (ctx, input) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      if (!validId(input.userId) || isGuestSeat(input.userId)) throw new SenderError('Invalid user ID')
      const seat = guestSeatIn(tx, input.battleId, input.seatId)
      const device = tx.db.guestSeats.seatId.find(input.seatId)
      if (
        !device?.deviceHash ||
        device.deviceHash !== input.deviceHash ||
        device.joinedAt === undefined ||
        !guestSessionCurrent(safeNumber(device.joinedAt), safeNumber(input.now))
      )
        return productJson('this device is not playing that seat')
      const { seats, log } = battleData(tx, input.battleId)
      const state = reduceBattle(
        seats.map((one) => one.id),
        log,
        seats.map((one) => one.side),
        seats.filter((one) => one.automated).map((one) => one.id),
      )
      const refusal = guestClaimRefusal(
        state,
        seats.map((one) => one.id),
        input.userId,
      )
      if (refusal) return productJson(refusal)
      tx.db.battleUsers.key.delete(seat.key)
      tx.db.battleUsers.insert({
        ...seat,
        key: JSON.stringify([input.battleId, input.userId]),
        userId: input.userId,
        guestName: undefined,
        claimedSeat: input.seatId,
      })
      tx.db.guestSeats.seatId.delete(input.seatId)
      endGuestSessions(tx, input.seatId)
      for (const one of [...seats.map((other) => other.id), input.userId]) touchProduct(tx, one, 'battles', 'onboarding')
      touchPublic(tx, 'battles')
      touchPublic(tx, 'standings')
      touchAdmin(tx)
      return productJson('claimed')
    }),
)

/** Disconnects the device that held a guest seat, which its next token can no longer reconnect. */
function endGuestSessions(ctx: Context, seatId: string) {
  for (const row of Array.from(ctx.db.sessionAccess.userId.filter(seatId))) revoke(ctx, row.subject)
}

function touchBattleSeats(ctx: Context, battleId: string) {
  for (const seat of ctx.db.battleUsers.battleId.filter(battleId)) touchProduct(ctx, seat.userId, 'battles')
}

function friendshipKey(requesterId: string, addresseeId: string) {
  if (
    !validId(requesterId) ||
    !validId(addresseeId) ||
    requesterId === addresseeId ||
    isGuestSeat(addresseeId) ||
    isGuestSeat(requesterId)
  ) {
    throw new SenderError('Invalid friendship')
  }
  return JSON.stringify([requesterId, addresseeId])
}

function acceptedFriendIds(ctx: Context, userId: string) {
  const ids = new Set<string>()
  for (const row of ctx.db.friendships.requesterId.filter(userId)) if (row.acceptedAt !== undefined) ids.add(row.addresseeId)
  for (const row of ctx.db.friendships.addresseeId.filter(userId)) if (row.acceptedAt !== undefined) ids.add(row.requesterId)
  return ids
}

function friendshipBetween(ctx: Context, leftId: string, rightId: string) {
  return ctx.db.friendships.key.find(friendshipKey(leftId, rightId)) ?? ctx.db.friendships.key.find(friendshipKey(rightId, leftId))
}

export const friendshipsByUser = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (!validId(userId)) throw new SenderError('Invalid user ID')
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
    if (userIds.length > 100 || userIds.some((id) => !validId(id))) throw new SenderError('Invalid product stats query')
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
  if (!validId(userId)) throw new SenderError('Invalid user ID')
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
  if (!validId(userId)) throw new SenderError('Invalid user ID')
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

export const migrateProductData = spacetime.procedure({ table: t.string(), keys: t.array(t.string()) }, t.string(), (ctx, input) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    const { table: entity, keys } = z
      .object({ table: z.enum(['rosters', 'collection']), keys: z.array(z.string().min(1).max(512)).max(20) })
      .parse(input)
    let changed = 0
    for (const key of keys) {
      if (entity === 'rosters') {
        const row = tx.db.rosters.id.find(key)
        if (!row) continue
        const stored = migrateStoredRoster(row)
        const migrated = { ...stored, prep: adoptRosterReminders(tx, row.userId, stored.prep, row.updatedAt, 'migrate') }
        if (productJson(migrated) === productJson(row)) continue
        tx.db.rosters.id.update(migrated)
        touchProduct(tx, row.userId, 'rosters')
        changed++
      } else {
        const row = tx.db.collection.key.find(key)
        if (!row || !migrateCollectionHeart(tx, row)) continue
        touchProduct(tx, row.userId, 'collection', 'favourites')
        changed++
      }
    }
    return productJson({ changed })
  }),
)

const rosterInput = z
  .object({
    id: idInput,
    userId: idInput,
    name: z.string().max(80),
    automaticName: z
      .unknown()
      .optional()
      .transform((value) => value === true),
    catalogueId: idInput,
    detachmentId: z.string().max(1_000).nullable(),
    disposition: z.string().max(MAX_ID_LENGTH).nullable(),
    limit: z.number().int().min(0).max(10_000),
    pointsBudget: z.number().nullish(),
    picks: z.string().max(1_000_000),
    prep: z.string().max(100_000).nullable(),
    tags: z.string().max(10_000),
    waivedRules: z.string().max(10_000),
    optionalRules: z.string().max(10_000),
    borrowedDetachmentId: z.string().max(MAX_ID_LENGTH).nullable(),
    baseRosterId: z
      .string()
      .max(MAX_ID_LENGTH)
      .nullish()
      .transform((value) => value ?? null),
    copiedFromRosterId: z
      .string()
      .max(MAX_ID_LENGTH)
      .nullish()
      .transform((value) => value ?? null),
    visibility: z.enum(ROSTER_VISIBILITIES),
    source: z.enum(ROSTER_SOURCES),
    now: z.number().int().nonnegative(),
  })
  .refine(({ limit, pointsBudget }) => !pointsBudgetError(limit, pointsBudget))

function parseRoster(payload: string) {
  const row = decodePayload(rosterInput, payload, 'Invalid roster')
  return migrateStoredRoster({
    ...row,
    /** Undefined when the client predates custom budgets, so its save keeps the stored one. */
    pointsBudget: row.pointsBudget === undefined ? undefined : customPointsBudget(row.limit, row.pointsBudget),
  })
}

export const rosterById = spacetime.procedure({ id: t.string() }, t.string(), (ctx, { id }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (!validId(id)) throw new SenderError('Invalid roster ID')
    return productJson(tx.db.rosters.id.find(id) ?? null)
  }),
)

export const rostersByUser = spacetime.procedure(
  { userId: t.string(), publicOnly: t.bool(), limit: t.u32() },
  t.string(),
  (ctx, { userId, publicOnly, limit }) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      if (!validId(userId) || limit < 1 || limit > 1_000) throw new SenderError('Invalid roster query')
      const rows = Array.from(tx.db.rosters.userId.filter(userId))
        .filter((row) => !publicOnly || row.visibility === 'public')
        .sort((left, right) => (right.createdAt > left.createdAt ? 1 : right.createdAt < left.createdAt ? -1 : 0))
      if (!publicOnly && rows.length > limit) throw new SenderError('Roster list exceeds the supported limit')
      return productJson(rows.slice(0, limit))
    }),
)

export const discoverRosters = spacetime.procedure({ payload: t.string() }, t.string(), (ctx, { payload }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (payload.length > 200_000) throw new SenderError('Invalid roster discovery')
    const query = decodePayload(rosterDiscoveryQuerySchema, payload, 'Invalid roster discovery')
    const { audience, viewerId } = query
    if (audience === 'friends' && !viewerId) throw new SenderError('Invalid roster discovery')
    const rows = function* () {
      for (const row of tx.db.rosters.visibility.filter('public'))
        yield { ...row, createdAt: safeNumber(row.createdAt), updatedAt: safeNumber(row.updatedAt) }
    }
    return productJson(discoveryPage(rows(), query, audience === 'friends' ? acceptedFriendIds(tx, viewerId!) : undefined))
  }),
)

function rosterSummary(row: StoredRoster) {
  const picks = JSON.parse(row.picks) as { attachedTo?: number }[]
  return {
    id: row.id,
    name: row.name,
    automaticName: row.automaticName,
    catalogueId: row.catalogueId,
    detachmentId: row.detachmentId,
    disposition: row.disposition,
    limit: row.limit,
    pointsBudget: row.pointsBudget,
    waivedRules: row.waivedRules,
    optionalRules: row.optionalRules,
    borrowedDetachmentId: row.borrowedDetachmentId,
    baseRosterId: row.baseRosterId,
    locked: row.locked,
    archived: row.archived,
    visibility: row.visibility,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    unitCount: listUnitCount(picks),
  }
}

export const rosterSummariesByUser = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (!validId(userId)) throw new SenderError('Invalid roster query')
    const rows = Array.from(tx.db.rosters.userId.filter(userId))
    if (rows.length > 1_000) throw new SenderError('Roster list exceeds the supported limit')
    rows.sort((left, right) => (right.createdAt > left.createdAt ? 1 : right.createdAt < left.createdAt ? -1 : 0))
    return productJson(rows.map(rosterSummary))
  }),
)

export const rosterGroupByUser = spacetime.procedure(
  { userId: t.string(), baseRosterId: t.string() },
  t.string(),
  (ctx, { userId, baseRosterId }) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      if (!validId(userId) || !validId(baseRosterId)) throw new SenderError('Invalid roster query')
      const rows = Array.from(tx.db.rosters.userId.filter(userId))
      if (rows.length > 1_000) throw new SenderError('Roster list exceeds the supported limit')
      return productJson(
        orderVariantGroup(
          rows.filter((row) => (row.baseRosterId ?? row.id) === baseRosterId),
          baseRosterId,
        ).map(({ id, name, automaticName }) => ({ id, name, automaticName })),
      )
    }),
)

export const rostersByIds = spacetime.procedure({ userId: t.string(), ids: t.array(t.string()) }, t.string(), (ctx, { userId, ids }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (
      !validId(userId) ||
      !ids.length ||
      ids.length > ROSTER_LIBRARY_BATCH_SIZE ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !validId(id))
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
    if (!validId(userId)) throw new SenderError('Invalid roster query')
    const rows: NonNullable<ReturnType<typeof tx.db.rosters.id.find>>[] = []
    let scanned = 0
    let count = 0
    const compare = (left: (typeof rows)[number], right: (typeof rows)[number]) => {
      if (left.updatedAt !== right.updatedAt) return left.updatedAt > right.updatedAt ? -1 : 1
      return left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
    }
    for (const row of tx.db.rosters.userId.filter(userId)) {
      if (++scanned > 1_000) throw new SenderError('Roster list exceeds the supported limit')
      if (row.archived) continue
      count++
      rows.push(row)
      rows.sort(compare)
      if (rows.length > 5) rows.pop()
    }
    return productJson({ count, rows })
  }),
)

type StoredRoster = NonNullable<ReturnType<Context['db']['rosters']['id']['find']>>

/** A save that does not state a budget keeps the stored one where its battle size still allows it. */
function savedPointsBudget(current: StoredRoster | null, input: ReturnType<typeof parseRoster>) {
  if (input.pointsBudget !== undefined) return input.pointsBudget
  const stored = current?.pointsBudget ?? null
  return pointsBudgetError(input.limit, stored) ? null : customPointsBudget(input.limit, stored)
}

function lockedEdit(current: StoredRoster | null, input: ReturnType<typeof parseRoster>) {
  return current?.locked
    ? lockedRosterRefusal(
        { ...storedRosterContent(migrateStoredRoster(current)), locked: current.locked },
        storedRosterContent({ ...input, pointsBudget: savedPointsBudget(current, input) }),
      )
    : null
}

/**
 * The group a new variant joins, so variants of variants stay one flat group. A group outlives
 * its deleted base, so a device may still name it by the id its remaining members store.
 */
function variantGroupOf(tx: Context, userId: string, baseRosterId: string) {
  const base = tx.db.rosters.id.find(baseRosterId)
  if (base) return base.userId === userId ? (base.baseRosterId ?? base.id) : null
  return Array.from(tx.db.rosters.userId.filter(userId)).some((row) => row.baseRosterId === baseRosterId) ? baseRosterId : null
}

function saveRosterIn(tx: Context, input: ReturnType<typeof parseRoster>) {
  const current = tx.db.rosters.id.find(input.id)
  if (current?.userId !== undefined && current.userId !== input.userId) return 'forbidden'
  if (lockedEdit(current, input)) return 'locked'
  const now = BigInt(input.now)
  const fields = {
    name: input.name,
    automaticName: input.automaticName,
    catalogueId: input.catalogueId,
    detachmentId: input.detachmentId ?? undefined,
    disposition: input.disposition ?? undefined,
    limit: input.limit,
    pointsBudget: savedPointsBudget(current, input) ?? undefined,
    picks: input.picks,
    prep: adoptRosterReminders(tx, input.userId, input.prep, now, 'save') ?? undefined,
    tags: input.tags,
    waivedRules: input.waivedRules,
    optionalRules: input.optionalRules,
    borrowedDetachmentId: input.borrowedDetachmentId ?? undefined,
    visibility: input.visibility,
    source: input.source,
    updatedAt: current && current.updatedAt >= now ? current.updatedAt + 1n : now,
  }
  if (current) {
    tx.db.rosters.id.update({ ...current, ...fields })
    touchProduct(tx, input.userId, 'rosters', 'onboarding')
    touchBorrowers(tx, input.id)
    if (current.visibility !== 'private' || input.visibility !== 'private') touchPublic(tx, 'rosters')
    return 'updated'
  }
  const baseRosterId = input.baseRosterId ? variantGroupOf(tx, input.userId, input.baseRosterId) : undefined
  if (baseRosterId === null) return 'forbidden'
  tx.db.rosters.insert({
    id: input.id,
    userId: input.userId,
    createdAt: BigInt(input.now),
    baseRosterId,
    // Where a copy came from, recorded once; readers resolve it through their own access.
    copiedFromRosterId: input.copiedFromRosterId ?? undefined,
    locked: false,
    archived: false,
    ...fields,
  })
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
  const parsed = decodePayload(
    z.object({
      row: z.string().max(1_200_000),
      operationId: z.uuid(),
      fingerprint: z.string().length(64),
      expectedVersion: z.number().int().nonnegative().nullable(),
      deleted: z.boolean(),
    }),
    payload,
    'Invalid roster',
  )
  const input = parseRoster(parsed.row)
  return ctx.withTx((tx) => {
    requireOperator(tx)
    const current = tx.db.rosters.id.find(input.id)
    const receipt = tx.db.rosterSync.id.find(input.id)
    if ((current && current.userId !== input.userId) || (receipt && receipt.userId !== input.userId))
      return productJson({ outcome: 'refused', message: 'You do not own this roster.' })
    if (receipt?.operationId === parsed.operationId) {
      if (receipt.fingerprint !== parsed.fingerprint) throw new SenderError('Operation ID reused for a different edit')
      return productJson({ outcome: 'applied', version: safeNumber(receipt.version), deleted: receipt.deleted, lifecycle: null })
    }
    const refusal = parsed.deleted ? null : lockedEdit(current, input)
    if (refusal) return productJson({ outcome: 'refused', message: refusal })
    if ((current ? safeNumber(current.updatedAt) : null) !== parsed.expectedVersion || (!current && receipt))
      return productJson({
        outcome: 'conflict',
        message: current ? 'This roster changed on another device.' : 'This roster was deleted on another device.',
      })
    let lifecycle: 'created' | 'deleted' | null = null
    if (parsed.deleted) {
      if (current) {
        endLoans(tx, input.id)
        tx.db.rosters.id.delete(input.id)
        touchProduct(tx, input.userId, 'rosters', 'onboarding')
        if (current.visibility !== 'private') touchPublic(tx, 'rosters')
        touchAdmin(tx)
        lifecycle = 'deleted'
      }
    } else {
      const saved = saveRosterIn(tx, input)
      if (saved === 'forbidden') return productJson({ outcome: 'refused', message: 'You do not own this roster.' })
      if (saved === 'locked') return productJson({ outcome: 'refused', message: LOCKED_ROSTER_MESSAGE })
      if (saved === 'inserted') lifecycle = 'created'
    }
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
    return productJson({ outcome: 'applied', version: safeNumber(version), deleted: parsed.deleted, lifecycle })
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

export const setRosterLocked = spacetime.procedure(
  { id: t.string(), userId: t.string(), locked: t.bool(), now: t.u64() },
  t.bool(),
  (ctx, { id, userId, locked, now }) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      const current = tx.db.rosters.id.find(id)
      if (!current || current.userId !== userId) return false
      tx.db.rosters.id.update({ ...current, locked, updatedAt: current.updatedAt >= now ? current.updatedAt + 1n : now })
      touchProduct(tx, userId, 'rosters')
      if (current.visibility !== 'private') touchPublic(tx, 'rosters')
      return true
    }),
)

export const setRosterArchived = spacetime.procedure(
  { id: t.string(), userId: t.string(), archived: t.bool(), now: t.u64() },
  t.bool(),
  (ctx, { id, userId, archived, now }) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      const current = tx.db.rosters.id.find(id)
      if (!current || current.userId !== userId) return false
      tx.db.rosters.id.update({ ...current, archived, updatedAt: current.updatedAt >= now ? current.updatedAt + 1n : now })
      touchProduct(tx, userId, 'rosters')
      if (current.visibility !== 'private') touchPublic(tx, 'rosters')
      return true
    }),
)

export const deleteRoster = spacetime.reducer({ id: t.string(), userId: t.string() }, (ctx, { id, userId }) => {
  requireOperator(ctx)
  const current = ctx.db.rosters.id.find(id)
  if (current?.userId === userId) {
    endLoans(ctx, id)
    ctx.db.rosters.id.delete(id)
    touchProduct(ctx, userId, 'rosters', 'onboarding')
    if (current.visibility !== 'private') touchPublic(ctx, 'rosters')
    touchAdmin(ctx)
  }
})

export const lendRoster = spacetime.procedure(
  { rosterId: t.string(), ownerId: t.string(), borrowerId: t.string(), now: t.u64() },
  t.string(),
  (ctx, { rosterId, ownerId, borrowerId, now }) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      if (tx.db.rosters.id.find(rosterId)?.userId !== ownerId) return 'forbidden'
      if (!validId(borrowerId) || borrowerId === ownerId) return 'not-friends'
      if (friendshipBetween(tx, ownerId, borrowerId)?.acceptedAt === undefined) return 'not-friends'
      const key = JSON.stringify([rosterId, borrowerId])
      if (tx.db.rosterLoans.key.find(key)) return 'lent'
      if (Array.from(tx.db.rosterLoans.rosterId.filter(rosterId)).length >= ROSTER_LOANS_PER_ROSTER) return 'too-many'
      tx.db.rosterLoans.insert({ key, rosterId, ownerId, borrowerId, lentAt: now })
      touchProduct(tx, ownerId, 'rosters')
      touchProduct(tx, borrowerId, 'rosters')
      return 'lent'
    }),
)

/** The owner revokes a loan, or the borrower hands it back. */
export const endRosterLoan = spacetime.procedure(
  { rosterId: t.string(), userId: t.string(), borrowerId: t.string() },
  t.bool(),
  (ctx, { rosterId, userId, borrowerId }) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      const loan = tx.db.rosterLoans.key.find(JSON.stringify([rosterId, borrowerId]))
      if (!loan || (userId !== loan.ownerId && userId !== loan.borrowerId)) return false
      endLoan(tx, loan)
      return true
    }),
)

export const rosterLoansByRoster = spacetime.procedure({ rosterId: t.string(), ownerId: t.string() }, t.string(), (ctx, input) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (tx.db.rosters.id.find(input.rosterId)?.userId !== input.ownerId) return productJson([])
    return productJson(
      Array.from(tx.db.rosterLoans.rosterId.filter(input.rosterId))
        .filter((loan) => activeLoan(tx, loan.rosterId, loan.borrowerId))
        .map((loan) => ({ borrowerId: loan.borrowerId, lentAt: safeNumber(loan.lentAt) })),
    )
  }),
)

/** A roster its owner may field, or a friend may field through an active loan. */
export const usableRoster = spacetime.procedure({ id: t.string(), userId: t.string() }, t.string(), (ctx, { id, userId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    const row = tx.db.rosters.id.find(id)
    if (!row || !userId) return productJson(null)
    if (row.userId === userId) return productJson({ roster: row, lentBy: null })
    return productJson(activeLoan(tx, id, userId) ? { roster: row, lentBy: row.userId } : null)
  }),
)

export const rostersLentTo = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (!validId(userId)) throw new SenderError('Invalid roster query')
    const loans = Array.from(tx.db.rosterLoans.borrowerId.filter(userId))
    if (loans.length > 1_000) throw new SenderError('Roster list exceeds the supported limit')
    return productJson(
      loans
        .filter((loan) => activeLoan(tx, loan.rosterId, userId))
        .flatMap((loan) => {
          const row = tx.db.rosters.id.find(loan.rosterId)
          return row ? [{ ...rosterSummary(row), ownerId: row.userId, lentAt: safeNumber(loan.lentAt), picks: row.picks }] : []
        })
        .sort((left, right) => right.lentAt - left.lentAt || left.id.localeCompare(right.id)),
    )
  }),
)

export const collectionByUser = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    moveHeartsToFavourites(tx, userId)
    return productJson(
      Array.from(tx.db.collection.userId.filter(userId)).map(({ key, userId: ownerId, entryId, at, models, built, painted, countsAs }) => ({
        userId: ownerId,
        entryId,
        at,
        models,
        built: built ?? 0,
        painted: painted ?? 0,
        countsAs: countsAs ?? [],
        ...collectionPhotoField(tx, { key, entryId }),
      })),
    )
  }),
)

export const collectionWishesByUser = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    return productJson(collectionWishes(tx, userId))
  }),
)

function collectionWishes(ctx: Context, userId: string) {
  return Array.from(ctx.db.collectionWishes.userId.filter(userId)).map(({ entryId, wanted }) => ({ entryId, wanted }))
}

export const collectionProfile = spacetime.procedure(
  { userId: t.string(), viewerId: t.option(t.string()) },
  t.string(),
  (ctx, { userId, viewerId }) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      moveHeartsToFavourites(tx, userId)
      const entries = []
      for (const row of tx.db.collection.userId.filter(userId)) {
        if (entries.length >= MAX_COLLECTION_DATASHEETS) throw new SenderError('Collection exceeds the supported limit')
        entries.push({
          entryId: row.entryId,
          models: row.models,
          built: row.built ?? 0,
          painted: row.painted ?? 0,
          ...collectionPhotoField(tx, row, viewerId === userId),
        })
      }
      return productJson({ entries, wishes: collectionWishes(tx, userId) })
    }),
)

function touchCollection(ctx: Context, userId: string) {
  touchProduct(ctx, userId, 'collection')
  touchPublic(ctx, 'collection')
}

export const addToCollection = spacetime.reducer({ userId: t.string(), entryId: t.string(), at: t.u64() }, (ctx, input) => {
  addToCollectionIn(ctx, [input.userId, input.entryId, input.at])
})

export const removeFromCollection = spacetime.reducer({ userId: t.string(), entryId: t.string() }, (ctx, input) => {
  removeFromCollectionIn(ctx, [input.userId, input.entryId])
})

export const setCollectionModels = spacetime.reducer(
  { userId: t.string(), entryId: t.string(), models: t.u32(), at: t.u64() },
  (ctx, input) => {
    setCollectionModelsIn(ctx, [input.userId, input.entryId, input.models, input.at])
  },
)

export const setCollectionProgress = spacetime.reducer(
  { userId: t.string(), entryId: t.string(), built: t.u32(), painted: t.u32() },
  (ctx, input) => {
    setCollectionProgressIn(ctx, [input.userId, input.entryId, input.built, input.painted])
  },
)

export const setCollectionCountsAs = spacetime.reducer(
  { userId: t.string(), entryId: t.string(), countsAs: t.array(t.string()) },
  (ctx, input) => {
    setCollectionCountsAsIn(ctx, [input.userId, input.entryId, input.countsAs])
  },
)

export const setCollectionWanted = spacetime.reducer(
  { userId: t.string(), entryId: t.string(), wanted: t.u32(), at: t.u64() },
  (ctx, input) => {
    setCollectionWantedIn(ctx, [input.userId, input.entryId, input.wanted, input.at])
  },
)

const countsAsId = z.string().min(1).max(64)
const importedCollectionRow = z.object({
  entryId: countsAsId,
  models: z.number().int().min(0).max(MAX_COLLECTION_MODELS),
  built: z.number().int().min(0).max(MAX_COLLECTION_MODELS),
  painted: z.number().int().min(0).max(MAX_COLLECTION_MODELS),
  wanted: z.number().int().min(0).max(MAX_COLLECTION_MODELS),
  countsAs: z.array(countsAsId).max(MAX_COUNTS_AS).optional(),
})

/** Adds what each row lists; saved counts change only when `replace` is set, and nothing is removed. */
export const importCollection = spacetime.procedure(
  { userId: t.string(), rows: t.string(), replace: t.bool(), at: t.u64() },
  t.string(),
  (ctx, input) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      if (!validId(input.userId)) throw new SenderError('Invalid user ID')
      const rows = decodePayload(z.array(importedCollectionRow).max(MAX_COLLECTION_DATASHEETS), input.rows, 'Invalid collection import')
      if (new Set(rows.map((row) => row.entryId)).size !== rows.length) throw new SenderError('Each datasheet can appear once')
      moveHeartsToFavourites(tx, input.userId)
      let owned = Array.from(tx.db.collection.userId.filter(input.userId)).length
      const result = { added: 0, replaced: 0, kept: 0 }
      for (const row of rows) {
        const key = JSON.stringify([input.userId, row.entryId])
        if (row.models) {
          const current = tx.db.collection.key.find(key)
          const progress = boundedProgress(row.models, row)
          const links = countsAsList(row.entryId, row.countsAs ?? [])
          const countsAs = links.length ? links : undefined
          if (!current) {
            if (++owned > MAX_COLLECTION_DATASHEETS)
              throw new SenderError(`A collection holds up to ${MAX_COLLECTION_DATASHEETS} datasheets`)
            tx.db.collection.insert({
              key,
              userId: input.userId,
              entryId: row.entryId,
              at: input.at,
              models: row.models,
              ...progress,
              countsAs,
            })
            result.added++
          } else {
            const relinked = links.length > 0 && JSON.stringify(links) !== JSON.stringify(current.countsAs ?? [])
            if (
              current.models !== row.models ||
              (current.built ?? 0) !== progress.built ||
              (current.painted ?? 0) !== progress.painted ||
              (relinked && current.countsAs?.length)
            ) {
              if (input.replace) {
                tx.db.collection.key.update({ ...current, models: row.models, ...progress, countsAs: countsAs ?? current.countsAs })
                result.replaced++
              } else result.kept++
            } else if (relinked) {
              tx.db.collection.key.update({ ...current, countsAs })
              result.added++
            }
          }
        }
        if (row.wanted) {
          const current = tx.db.collectionWishes.key.find(key)
          if (!current) {
            tx.db.collectionWishes.insert({ key, userId: input.userId, entryId: row.entryId, wanted: row.wanted, at: input.at })
            result.added++
          } else if (current.wanted !== row.wanted) {
            if (input.replace) {
              tx.db.collectionWishes.key.update({ ...current, wanted: row.wanted })
              result.replaced++
            } else result.kept++
          }
        }
      }
      if (result.added || result.replaced) touchCollection(tx, input.userId)
      return productJson(result)
    }),
)

export const setCollectionPhoto = spacetime.reducer(
  { userId: t.string(), entryId: t.string(), photoId: t.string(), at: t.u64() },
  (ctx, input) => addCollectionPhoto(ctx, { ...input, shows: input.entryId }),
)

/** A photo kept with one collection row but filed under a datasheet its models also count as, so that datasheet's gallery shows it. */
export const setCollectionPhotoAs = spacetime.reducer(
  { userId: t.string(), entryId: t.string(), shows: t.string(), photoId: t.string(), at: t.u64() },
  (ctx, input) => addCollectionPhoto(ctx, input),
)

function addCollectionPhoto(ctx: Context, input: { userId: string; entryId: string; shows: string; photoId: string; at: bigint }) {
  requireOperator(ctx)
  const { userId, entryId, shows, photoId } = z
    .object({ userId: idInput, entryId: z.string().min(1).max(2_000_000), shows: z.string().min(1).max(64), photoId: z.uuid() })
    .parse(input)
  const key = JSON.stringify([userId, entryId])
  if (shows !== entryId && !ctx.db.collection.key.find(key)?.countsAs?.includes(shows))
    throw new SenderError('Choose a datasheet these models can also be')
  addToCollectionIn(ctx, [userId, entryId, input.at])
  if (Array.from(ctx.db.collectionPhotos.row.filter(key)).length >= MAX_DATASHEET_PHOTOS)
    throw new SenderError(`You can add up to ${MAX_DATASHEET_PHOTOS} photos of a datasheet`)
  ctx.db.collectionPhotos.insert({ photoId, key, userId, entryId: shows, at: input.at, likes: 0, review: undefined })
  touchCollection(ctx, userId)
  touchAdmin(ctx)
}

/** The owner's removal of one of their photos; another player's photo is left alone. */
export const removeCollectionPhoto = spacetime.reducer({ userId: t.string(), photoId: t.string() }, (ctx, { userId, photoId }) => {
  requireOperator(ctx)
  const photo = ctx.db.collectionPhotos.photoId.find(photoId)
  if (photo?.userId !== userId) return
  dropCollectionPhoto(ctx, photo)
  touchCollection(ctx, userId)
})

/** The photo's owner while it may be shown to `viewerId`. */
export const collectionPhoto = spacetime.procedure(
  { photoId: t.string(), viewerId: t.option(t.string()) },
  t.string(),
  (ctx, { photoId, viewerId }) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      const row = tx.db.collectionPhotos.photoId.find(photoId)
      return productJson(row && photoShown(row, viewerId) ? { userId: row.userId, entryId: row.entryId } : null)
    }),
)

/** The photo's owner whatever its visibility, for an administrator reviewing it. */
export const collectionPhotoForAdmin = spacetime.procedure({ photoId: t.string() }, t.string(), (ctx, { photoId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    const row = tx.db.collectionPhotos.photoId.find(photoId)
    return productJson(row ? { userId: row.userId, entryId: row.entryId } : null)
  }),
)

/** Always shown to its owner; to anyone else while no report holds it. */
function photoShown(row: { userId: string; review?: string }, viewerId: string | undefined) {
  return row.userId === viewerId || row.review !== 'held'
}

/** The photos of a datasheet its viewer may see, in gallery order. */
export const datasheetPhotos = spacetime.procedure(
  { entryId: t.string(), viewerId: t.option(t.string()), limit: t.u32() },
  t.string(),
  (ctx, { entryId, viewerId, limit }) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      const visible = Array.from(tx.db.collectionPhotos.entryId.filter(entryId)).filter((row) => photoShown(row, viewerId))
      return productJson(
        rankCollectionPhotos(visible.map((row) => ({ ...row, likes: row.likes ?? 0 })))
          .slice(0, Math.min(limit, 100))
          .map(({ photoId, userId, at, likes }) => ({
            photoId,
            userId,
            at,
            likes,
            liked: viewerId !== undefined && Boolean(tx.db.collectionPhotoLikes.key.find(JSON.stringify([photoId, viewerId]))),
          })),
      )
    }),
)

/** A reader's like of a photo they may see; liking twice, or taking back a like never given, changes nothing. */
export const setCollectionPhotoLike = spacetime.reducer(
  { userId: t.string(), photoId: t.string(), liked: t.bool(), at: t.u64() },
  (ctx, { userId, photoId, liked, at }) => {
    requireOperator(ctx)
    const photo = ctx.db.collectionPhotos.photoId.find(photoId)
    if (!photo || !photoShown(photo, userId)) throw new SenderError('That photo is no longer shown')
    if (photo.userId === userId) throw new SenderError('You cannot like your own photo')
    setLike(ctx, photoId, userId, liked, at)
  },
)

/** A reader's report, which holds the photo for review; a photo an administrator kept stays shown and is flagged for another look. */
export const reportCollectionPhoto = spacetime.reducer({ userId: t.string(), photoId: t.string() }, (ctx, { userId, photoId }) => {
  requireOperator(ctx)
  const photo = ctx.db.collectionPhotos.photoId.find(photoId)
  if (!photo || !photoShown(photo, userId)) throw new SenderError('That photo is no longer shown')
  if (photo.userId === userId) throw new SenderError('You cannot report your own photo')
  if (photo.review === 'kept') {
    ctx.db.collectionPhotos.photoId.update({ ...photo, review: 'flagged' })
    touchAdmin(ctx)
    return
  }
  if (photo.review) return
  ctx.db.collectionPhotos.photoId.update({ ...photo, review: 'held' })
  touchCollection(ctx, photo.userId)
  touchAdmin(ctx)
})

/** An administrator's decision to show a reported photo, after which a report only flags it. */
export const keepCollectionPhoto = spacetime.reducer({ photoId: t.string() }, (ctx, { photoId }) => {
  requireOperator(ctx)
  const photo = ctx.db.collectionPhotos.photoId.find(photoId)
  if (!photo || photo.review === 'kept') return
  ctx.db.collectionPhotos.photoId.update({ ...photo, review: 'kept' })
  touchCollection(ctx, photo.userId)
  touchAdmin(ctx)
})

/** Reported photos awaiting an administrator's decision, oldest first, and whether each is still shown. */
export const heldCollectionPhotos = spacetime.procedure({ limit: t.u32() }, t.string(), (ctx, { limit }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    const held = []
    for (const row of tx.db.collectionPhotos.iter()) if (awaitsReview(row)) held.push(row)
    return productJson(
      held
        .sort((left, right) => Number(left.at - right.at) || left.photoId.localeCompare(right.photoId))
        .slice(0, Math.min(limit, 100))
        .map(({ photoId, userId, entryId, at, review }) => ({ photoId, userId, entryId, at, shown: review === 'flagged' })),
    )
  }),
)

const adminCollectionPhotosQuery = z.strictObject({
  before: z.strictObject({ at: z.number().int().nonnegative(), id: z.string().max(MAX_ID_LENGTH) }).nullable(),
  limit: z.number().int().min(1).max(100),
})

/** Photos awaiting no review, newest first, a page at a time for administrators, with whether others can see each and its likes. */
export const adminCollectionPhotos = spacetime.procedure({ payload: t.string() }, t.string(), (ctx, { payload }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (payload.length > 1_000) throw new SenderError('Invalid photo list')
    const input = decodePayload(adminCollectionPhotosQuery, payload, 'Invalid photo list')
    const rows = []
    for (const row of tx.db.collectionPhotos.iter()) {
      if (awaitsReview(row)) continue
      const at = safeNumber(row.at)
      if (input.before && (at > input.before.at || (at === input.before.at && row.photoId >= input.before.id))) continue
      rows.push({ row, at })
    }
    rows.sort((left, right) => right.at - left.at || right.row.photoId.localeCompare(left.row.photoId))
    const photos = rows.slice(0, input.limit).map(({ row, at }) => ({
      photoId: row.photoId,
      userId: row.userId,
      entryId: row.entryId,
      at,
      likes: row.likes ?? 0,
      kept: row.review === 'kept',
    }))
    const last = photos.at(-1)
    return productJson({ photos, nextCursor: rows.length > input.limit && last ? { at: last.at, id: last.photoId } : null })
  }),
)

function awaitsReview(row: { review?: string }) {
  return row.review === 'held' || row.review === 'flagged'
}

function setLike(ctx: Context, photoId: string, userId: string, liked: boolean, at: bigint) {
  const key = JSON.stringify([photoId, userId])
  if (Boolean(ctx.db.collectionPhotoLikes.key.find(key)) === liked) return
  if (liked) ctx.db.collectionPhotoLikes.insert({ key, photoId, userId, at })
  else ctx.db.collectionPhotoLikes.key.delete(key)
  const photo = ctx.db.collectionPhotos.photoId.find(photoId)
  if (!photo) return
  ctx.db.collectionPhotos.photoId.update({ ...photo, likes: Math.max(0, (photo.likes ?? 0) + (liked ? 1 : -1)) })
  touchCollection(ctx, photo.userId)
}

/** An administrator's removal, by the photo a reader reported. */
export const removeCollectionPhotoById = spacetime.reducer({ photoId: t.string() }, (ctx, { photoId }) => {
  requireOperator(ctx)
  const photo = ctx.db.collectionPhotos.photoId.find(photoId)
  if (!photo) return
  dropCollectionPhoto(ctx, photo)
  touchCollection(ctx, photo.userId)
})

export const collectionPhotoIds = spacetime.procedure(
  { after: t.option(t.string()), limit: t.u32() },
  t.string(),
  (ctx, { after, limit }) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      return productJson(
        Array.from(tx.db.collectionPhotos.iter(), (photo) => photo.photoId)
          .filter((photoId) => after === undefined || photoId > after)
          .sort()
          .slice(0, Math.min(limit, 100)),
      )
    }),
)

export const collectionPhotoDeletions = spacetime.procedure({ limit: t.u32() }, t.string(), (ctx, { limit }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    const ids: string[] = []
    for (const row of tx.db.collectionPhotoDeletions.iter()) {
      if (ids.length >= Math.min(limit, 1_000)) break
      ids.push(row.photoId)
    }
    return productJson(ids)
  }),
)

export const queueCollectionPhotoDeletion = spacetime.reducer({ photoId: t.string() }, (ctx, { photoId }) => {
  requireOperator(ctx)
  z.uuid().parse(photoId)
  if (!ctx.db.collectionPhotos.photoId.find(photoId) && !ctx.db.collectionPhotoDeletions.photoId.find(photoId))
    ctx.db.collectionPhotoDeletions.insert({ photoId })
})

export const clearCollectionPhotoDeletions = spacetime.reducer({ photoIds: t.array(t.string()) }, (ctx, { photoIds }) => {
  requireOperator(ctx)
  for (const photoId of photoIds.slice(0, 1_000)) ctx.db.collectionPhotoDeletions.photoId.delete(photoId)
})

/**
 * A collection row's photos, oldest first; absent rather than empty when there are none, because `productJson` writes
 * undefined fields as null. Only the owner sees a held photo.
 */
function collectionPhotoField(ctx: Context, row: { key: string; entryId: string }, owner = true) {
  const photos = Array.from(ctx.db.collectionPhotos.row.filter(row.key))
    .filter((photo) => owner || photo.review !== 'held')
    .toSorted((left, right) => Number(left.at - right.at) || left.photoId.localeCompare(right.photoId))
  const shows = photos.filter((photo) => photo.entryId !== row.entryId).map((photo) => [photo.photoId, photo.entryId])
  return photos.length
    ? { photoIds: photos.map((photo) => photo.photoId), ...(shows.length ? { photoShows: Object.fromEntries(shows) } : {}) }
    : {}
}

/** Drops a photo and its likes, leaving its id for the web server to delete the stored object. */
function dropCollectionPhoto(ctx: Context, photo: { photoId: string }) {
  ctx.db.collectionPhotos.photoId.delete(photo.photoId)
  for (const like of Array.from(ctx.db.collectionPhotoLikes.photoId.filter(photo.photoId))) ctx.db.collectionPhotoLikes.key.delete(like.key)
  ctx.db.collectionPhotoDeletions.insert({ photoId: photo.photoId })
  touchAdmin(ctx)
}

function dropCollectionRowPhotos(ctx: Context, key: string) {
  for (const photo of Array.from(ctx.db.collectionPhotos.row.filter(key))) dropCollectionPhoto(ctx, photo)
}

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

export const favouriteDatasheetsByUser = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    moveHeartsToFavourites(tx, userId)
    return productJson(
      Array.from(tx.db.favouriteDatasheets.userId.filter(userId)).map(({ userId: ownerId, entryId, at }) => ({
        userId: ownerId,
        entryId,
        at,
      })),
    )
  }),
)

export const addFavouriteDatasheet = spacetime.reducer({ userId: t.string(), entryId: t.string(), at: t.u64() }, (ctx, input) => {
  addFavouriteDatasheetIn(ctx, [input.userId, input.entryId, input.at])
})

export const removeFavouriteDatasheet = spacetime.reducer({ userId: t.string(), entryId: t.string() }, (ctx, input) => {
  removeFavouriteDatasheetIn(ctx, [input.userId, input.entryId])
})

export const recentMatchupsByUser = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    return productJson(recentMatchupsOf(tx, userId).map(({ shared, attacker, defender, at }) => ({ shared, attacker, defender, at })))
  }),
)

export const rememberMatchup = spacetime.reducer(
  { userId: t.string(), pairing: t.string(), shared: t.string(), attacker: t.string(), defender: t.string(), at: t.u64() },
  (ctx, input) => {
    rememberMatchupIn(ctx, [input.userId, input.pairing, input.shared, input.attacker, input.defender, input.at])
  },
)

export const forgetMatchup = spacetime.reducer({ userId: t.string(), pairing: t.string() }, (ctx, input) => {
  forgetMatchupIn(ctx, [input.userId, input.pairing])
})

export const abilityRemindersByUser = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    return productJson(
      Array.from(tx.db.abilityReminders.userId.filter(userId))
        .toSorted((left, right) => left.key.localeCompare(right.key))
        .map((row) => JSON.parse(row.reminder) as unknown),
    )
  }),
)

/** `full` changes nothing; replacing an alert the player already has never counts against the limit. */
export const saveAbilityReminder = spacetime.procedure({ userId: t.string(), payload: t.string(), at: t.u64() }, t.string(), (ctx, input) =>
  ctx.withTx((tx) => saveAbilityReminderIn(tx, [input.userId, input.payload, input.at])),
)

export const deleteAbilityReminder = spacetime.reducer({ userId: t.string(), key: t.string() }, (ctx, input) => {
  deleteAbilityReminderIn(ctx, [input.userId, input.key])
})

function saveAbilityReminderIn(tx: Context, args: unknown[]) {
  const [userId, payload, at] = z.tuple([idInput, z.string().max(20_000), timestampArg]).parse(args)

  requireOperator(tx)
  const reminder = decodePayload(abilityReminderSchema.strict(), payload, 'Invalid reminder')
  return productJson(writeAbilityReminder(tx, userId, reminder, at) ? 'saved' : 'full')
}

function deleteAbilityReminderIn(tx: Context, args: unknown[]) {
  const [userId, key] = z.tuple([idInput, z.string().max(240)]).parse(args)

  requireOperator(tx)
  if (tx.db.abilityReminders.key.delete(JSON.stringify([userId, key]))) touchProduct(tx, userId, 'settings')
}

function writeAbilityReminder(tx: Context, userId: string, reminder: z.infer<typeof abilityReminderSchema>, at: bigint) {
  const key = JSON.stringify([userId, reminder.key])
  const current = tx.db.abilityReminders.key.find(key)
  const row = { key, userId, reminder: JSON.stringify(reminder), updatedAt: at }
  if (current) tx.db.abilityReminders.key.update(row)
  else if (Array.from(tx.db.abilityReminders.userId.filter(userId)).length >= ABILITY_REMINDERS_MAX) return false
  else tx.db.abilityReminders.insert(row)
  touchProduct(tx, userId, 'settings')
  return true
}

/**
 * A roster's prep without the per-unit alerts older builds kept in it, which become the owner's ability alerts. A
 * migration also replaces an account alert set before the roster was saved at `savedAt`; a save only adds alerts the
 * account lacks, since an older tab or a queued offline save can carry alerts the player has since changed. Alerts the
 * full account refuses stay in the prep for a later save or migration to adopt.
 */
function adoptRosterReminders(tx: Context, userId: string, prep: string | null | undefined, savedAt: bigint, mode: 'migrate' | 'save') {
  if (!prep) return undefined
  const { reminders, ...rest } = z.record(z.string(), z.unknown()).parse(JSON.parse(prep))
  if (reminders === undefined) return prep
  const kept = rosterReminderSchema.array().max(ROSTER_REMINDERS_MAX).safeParse(reminders)
  if (!kept.success) return JSON.stringify(rest)
  const refused = new Set<string>()
  for (const reminder of abilityRemindersFromRosters([{ updatedAt: 0, reminders: kept.data }])) {
    const current = tx.db.abilityReminders.key.find(JSON.stringify([userId, reminder.key]))
    if (current && (mode === 'save' || current.updatedAt >= savedAt)) continue
    if (!writeAbilityReminder(tx, userId, reminder, savedAt)) refused.add(reminder.key)
  }
  const left = kept.data.filter((reminder) => refused.has(legacyAbilityKey(reminder)))
  return JSON.stringify(left.length ? { ...rest, reminders: left } : rest)
}

export const addFavouriteFaction = spacetime.reducer({ userId: t.string(), catalogueId: t.string(), at: t.u64() }, (ctx, input) => {
  addFavouriteFactionIn(ctx, [input.userId, input.catalogueId, input.at])
})

export const removeFavouriteFaction = spacetime.reducer({ userId: t.string(), catalogueId: t.string() }, (ctx, input) => {
  removeFavouriteFactionIn(ctx, [input.userId, input.catalogueId])
})

export const unitLoadoutsByUser = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    return productJson(
      Array.from(tx.db.unitLoadouts.userId.filter(userId))
        .toSorted((left, right) => Number(right.createdAt - left.createdAt) || left.id.localeCompare(right.id))
        .map(({ id, name, catalogueId, pick, joined, createdAt }) => ({
          id,
          name,
          catalogueId,
          pick: JSON.parse(pick) as unknown,
          ...(joined ? { joined: JSON.parse(joined) as unknown } : {}),
          createdAt,
        })),
    )
  }),
)

/** `saved` also answers a retried save; `full` and `refused` change nothing. */
export const saveUnitLoadout = spacetime.procedure(
  { id: t.string(), userId: t.string(), payload: t.string(), at: t.u64() },
  t.string(),
  (ctx, { id, userId, payload, at }) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      if (!validId(id) || !validId(userId)) throw new SenderError('Invalid loadout')
      const loadout = decodePayload(unitLoadoutSchema.strict(), payload, 'Invalid loadout')
      const current = tx.db.unitLoadouts.id.find(id)
      if (current) return current.userId === userId ? 'saved' : 'refused'
      if (Array.from(tx.db.unitLoadouts.userId.filter(userId)).length >= UNIT_LOADOUTS_MAX) return 'full'
      tx.db.unitLoadouts.insert({
        id,
        userId,
        name: loadout.name,
        catalogueId: loadout.catalogueId,
        pick: JSON.stringify(loadout.pick),
        createdAt: at,
        joined: loadout.joined && JSON.stringify(loadout.joined),
      })
      touchProduct(tx, userId, 'rosters')
      return 'saved'
    }),
)

/** Only the name changes, so rosters and searches keep finding the same loadout. */
export const renameUnitLoadout = spacetime.procedure({ id: t.string(), userId: t.string(), name: t.string() }, t.bool(), (ctx, input) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    const name = unitLoadoutNameSchema.safeParse(input.name)
    if (!name.success) throw new SenderError('Invalid loadout')
    const current = tx.db.unitLoadouts.id.find(input.id)
    if (current?.userId !== input.userId) return false
    tx.db.unitLoadouts.id.update({ ...current, name: name.data })
    touchProduct(tx, input.userId, 'rosters')
    return true
  }),
)

export const deleteUnitLoadout = spacetime.procedure({ id: t.string(), userId: t.string() }, t.bool(), (ctx, { id, userId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (tx.db.unitLoadouts.id.find(id)?.userId !== userId) return false
    tx.db.unitLoadouts.id.delete(id)
    touchProduct(tx, userId, 'rosters')
    return true
  }),
)

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
      !validId(input.userId) ||
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

export const clubNames = spacetime.procedure({ tokens: t.array(t.string()) }, t.string(), (ctx, { tokens }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (tokens.length > 100) throw new SenderError('Too many club names')
    return productJson(
      [...new Set(tokens)].flatMap((token) => {
        const club = tx.db.clubs.token.find(token)
        return club ? [[club.token, club.name]] : []
      }),
    )
  }),
)

const LEAGUES_TO_CLUBS = 'leagues-to-clubs'

/**
 * Leagues ran as standing groups, each a series of events. Each becomes a club with its people, and each event a
 * tournament inside it: the first keeps the league's row and link, and later ones become rows keyed by their event.
 * Runs once; the server asks at every start.
 */
export const migrateLeaguesToClubs = spacetime.procedure({ now: t.u64() }, t.u32(), (ctx, { now }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (tx.db.completedMigrations.name.find(LEAGUES_TO_CLUBS)) return 0
    const leagues = Array.from(tx.db.leagues.iter()).filter((league) => league.clubId === undefined)
    for (const league of leagues) {
      tx.db.clubs.insert({
        id: league.id,
        token: league.token,
        ownerId: league.ownerId,
        name: league.name,
        description: league.description,
        visibility: league.visibility,
        admission: league.admission,
        createdAt: league.createdAt,
      })
      const adminIds = leagueAdminIds(tx, league.id)
      const events = leagueEventsFor(tx, league.id).toReversed()
      const people = new Set([league.ownerId, ...adminIds])
      for (const event of events)
        for (const entry of tx.db.leagueEventEntries.eventId.filter(event.id)) if (entry.status === 'accepted') people.add(entry.userId)
      for (const userId of people)
        tx.db.clubMembers.insert({
          key: JSON.stringify([league.id, userId]),
          clubId: league.id,
          userId,
          status: 'accepted',
          role: adminIds.includes(userId) ? 'admin' : 'member',
          joinedAt: now,
        })
      // A series of events reads as one tournament per event, each named for its place in the series.
      const name = (number: number) => (events.length > 1 ? `${league.name}, event ${number}` : league.name)
      tx.db.leagues.id.update({ ...league, name: name(1), clubId: league.id })
      for (const event of events.slice(1)) {
        tx.db.leagues.insert({
          ...league,
          id: event.id,
          token: event.token,
          name: name(event.number),
          createdAt: event.createdAt,
          clubId: league.id,
        })
        tx.db.leagueEvents.id.update({ ...event, leagueId: event.id, number: 1 })
        for (const userId of adminIds)
          tx.db.leagueAdmins.insert({ key: JSON.stringify([event.id, userId]), leagueId: event.id, userId, addedAt: now })
      }
      touchLeague(tx, league.id)
      touchClub(tx, league.id)
    }
    tx.db.completedMigrations.insert({ name: LEAGUES_TO_CLUBS, at: now })
    return leagues.length
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

function roundPairings(ctx: Context, eventId: string) {
  return Array.from(ctx.db.leagueRoundPairings.eventId.filter(eventId)).sort((a, b) => a.round - b.round || a.table - b.table)
}

/** A bye is done as soon as it is paired; a table once its battle has ended. */
function pairingFinished(ctx: Context, pairing: { bId: string | undefined; battleId: string | undefined }) {
  if (pairing.bId === undefined) return true
  if (pairing.battleId === undefined || !ctx.db.battles.id.find(pairing.battleId)) return false
  const { seats, log } = battleData(ctx, pairing.battleId)
  return (
    reduceBattle(
      seats.map((seat) => seat.id),
      log,
      seats.map((seat) => seat.side),
    ).status === 'finished'
  )
}

function leagueEventFor(ctx: Context, leagueId: string, token: string | null) {
  const events = leagueEventsFor(ctx, leagueId)
  return token ? events.find((event) => event.token === token) : events[0]
}

function leagueRecord(ctx: Context, token: string, eventToken: string | null) {
  // A link from before tournaments split from their league names the old league and the event, which may now be its own tournament.
  const moved = eventToken ? ctx.db.leagueEvents.token.find(eventToken) : undefined
  const league =
    moved && ctx.db.leagues.token.find(token)?.id !== moved.leagueId
      ? ctx.db.leagues.id.find(moved.leagueId)
      : ctx.db.leagues.token.find(token)
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
    teams: Array.from(ctx.db.leagueEventTeams.eventId.filter(selected.id), ({ teamId, disposition }) => ({ teamId, disposition })),
    teamWarlords: Array.from(ctx.db.leagueEventTeamWarlords.eventId.filter(selected.id), ({ teamId, userId }) => ({ teamId, userId })),
    adminIds: leagueAdminIds(ctx, league.id),
    latestEntryCount: latestEntries.length,
    latestAcceptedCount: latestEntries.filter((entry) => entry.status === 'accepted').length,
    pairings: roundPairings(ctx, selected.id).map((pairing) => ({
      key: pairing.key,
      round: pairing.round,
      table: pairing.table,
      aId: pairing.aId,
      bId: pairing.bId ?? null,
      battleToken: pairing.battleId ? (ctx.db.battles.id.find(pairing.battleId)?.token ?? null) : null,
    })),
    club: (() => {
      const club = league.clubId ? ctx.db.clubs.id.find(league.clubId) : undefined
      return club ? { token: club.token, name: club.name } : null
    })(),
  }
}

export const leagueByToken = spacetime.procedure({ token: t.string(), eventToken: t.string() }, t.string(), (ctx, { token, eventToken }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (token.length > MAX_ID_LENGTH || eventToken.length > MAX_ID_LENGTH) throw new SenderError('Invalid league token')
    return productJson(leagueRecord(tx, token, eventToken || null))
  }),
)

/** Leagues a player owns, helps run, or has entered in any event. */
function personalLeagueIds(ctx: Context, userId: string) {
  const ids = new Set<string>()
  for (const row of ctx.db.leagues.ownerId.filter(userId)) ids.add(row.id)
  for (const row of ctx.db.leagueAdmins.userId.filter(userId)) ids.add(row.leagueId)
  for (const entry of ctx.db.leagueEventEntries.userId.filter(userId)) {
    const event = ctx.db.leagueEvents.id.find(entry.eventId)
    if (event) ids.add(event.leagueId)
  }
  return ids
}

export const leaguesVisibleTo = spacetime.procedure({ userId: t.string(), limit: t.u32() }, t.string(), (ctx, { userId, limit }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (userId.length > MAX_ID_LENGTH || limit < 1 || limit > 100) throw new SenderError('Invalid league list')
    const personal = userId ? personalLeagueIds(tx, userId) : new Set<string>()
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
            adminIds: leagueAdminIds(tx, league.id),
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
      if (!validId(userId) || !validId(rosterId)) throw new SenderError('Invalid roster lookup')
      const saved = tx.db.rosters.id.find(rosterId)
      if (!saved || saved.userId !== userId) return productJson([])
      const prep = saved.prep ? (JSON.parse(saved.prep) as { remindersEnabled?: boolean }) : null
      const current = {
        name: saved.name,
        catalogueId: saved.catalogueId,
        detachmentIds: detachmentIds(saved.detachmentId),
        disposition: saved.disposition ?? null,
        limit: saved.limit,
        picks: rosterPickSchema.array().parse(JSON.parse(saved.picks)),
        waivedRules: JSON.parse(saved.waivedRules) as FormatRuleId[],
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

/** Friends' sealed lists from revealed events in leagues the viewer can list, newest reveal first. */
export const friendLeagueRosters = spacetime.procedure({ viewerId: t.string() }, t.string(), (ctx, { viewerId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (!validId(viewerId)) throw new SenderError('Invalid league roster list')
    const personal = personalLeagueIds(tx, viewerId)
    const rosters = []
    let scanned = 0
    for (const friendId of acceptedFriendIds(tx, viewerId)) {
      for (const entry of tx.db.leagueEventEntries.userId.filter(friendId)) {
        if (++scanned > 10_000) throw new SenderError('Too many league entries')
        if (entry.status !== 'accepted' || entry.rosterSnapshot === undefined) continue
        const event = tx.db.leagueEvents.id.find(entry.eventId)
        if (!event || event.revealedAt === undefined) continue
        const league = tx.db.leagues.id.find(event.leagueId)
        if (!league || (league.visibility !== 'public' && !personal.has(league.id))) continue
        let catalogueId: string | undefined
        try {
          catalogueId = parseRosterSnapshot(entry.rosterSnapshot).built?.catalogueId
        } catch {
          // An unreadable snapshot cannot be simulated.
        }
        if (!catalogueId) continue
        rosters.push({
          leagueToken: league.token,
          leagueName: league.name,
          eventToken: event.token,
          eventNumber: event.number,
          eventCount: leagueEventsFor(tx, league.id).length,
          userId: friendId,
          rosterName: entry.rosterName ?? '',
          catalogueId,
          revealedAt: event.revealedAt,
        })
      }
    }
    rosters.sort((a, b) => Number(b.revealedAt - a.revealedAt) || b.eventNumber - a.eventNumber)
    return productJson(rosters.slice(0, 50))
  }),
)

export const leagueBattleCandidates = spacetime.procedure(
  { userId: t.string(), participantIds: t.array(t.string()) },
  t.string(),
  (ctx, { userId, participantIds }) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      if (
        !validId(userId) ||
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
type LeagueEventRow = NonNullable<ReturnType<Context['db']['leagueEvents']['id']['find']>>

function leagueRosterSharingState(tx: Context, event: LeagueEventRow, userId: string) {
  if (event.revealedAt === undefined) return null
  const key = JSON.stringify([event.id, userId])
  const entry = tx.db.leagueEventEntries.key.find(key)
  if (entry?.status !== 'accepted' || entry.rosterSnapshot === undefined || entry.submittedAt === undefined) return null
  const roster = entry.rosterId ? tx.db.rosters.id.find(entry.rosterId) : null
  if (!roster || roster.userId !== userId) return null
  return {
    entry,
    roster,
    state: {
      submittedAt: safeNumber(entry.submittedAt),
      prompt: !tx.db.leagueRosterSharing.key.find(key) && roster.visibility !== 'public',
      roster: {
        id: roster.id,
        name: roster.name || entry.rosterName || 'Your saved roster',
        visibility: roster.visibility,
        updatedAt: safeNumber(roster.updatedAt),
      },
    },
  }
}

export const leagueRosterSharing = spacetime.procedure(
  { token: t.string(), eventToken: t.string(), userId: t.string() },
  t.string(),
  (ctx, { token, eventToken, userId }) =>
    ctx.withTx((tx) => {
      requireOperator(tx)
      const league = tx.db.leagues.token.find(token)
      const event = league && leagueEventFor(tx, league.id, eventToken)
      return productJson(event ? (leagueRosterSharingState(tx, event, userId)?.state ?? null) : null)
    }),
)

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

const leagueTimeInput = z.number().int().nonnegative()
const leagueFormatInput = z.enum(TABLE_SHAPES)
// Absent on an update from an older client, which leaves the event's allowances as they stand.
const leagueRoundsInput = z.number().int().min(1).max(SWISS_ROUNDS_MAX).nullable()
const leaguePointsBudgetInput = z.number().int().min(POINTS_BUDGET_MIN).max(POINTS_BUDGET_MAX).nullable()
const leagueScheduleInput = z.object({ playsAt: leagueTimeInput.nullable(), sealBy: leagueTimeInput.nullable() })

/** A duel's own points total, or none when it matches the battle size or the format takes no override. */
function leaguePointsBudget(format: string | null, rosterLimit: number | null, budget: number | null) {
  if (budget === null || rosterLimit === null || budget === rosterLimit) return { budget: undefined }
  if (format !== '1v1' || pointsBudgetError(rosterLimit, budget)) return null
  return { budget }
}
const leagueRuleInput = z.object({
  format: leagueFormatInput,
  rosterLimit: z.number().int().positive().max(10_000),
  allowances: leagueAllowancesSchema.optional(),
  // Absent from an older client, which leaves the event's pairing and points total as they stand.
  rounds: leagueRoundsInput.optional(),
  pointsBudget: leaguePointsBudgetInput.optional(),
})

/** Null for an event created before allowances were recorded. */
const leagueEventAllowances = (event: LeagueEventRow) => (event.allowances === undefined ? null : parseLeagueAllowances(event.allowances))
const leagueDetailsInput = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2_000),
  visibility: z.enum(['public', 'private']),
  admission: z.enum(['automatic', 'approval']),
  playerLimit: z.number().int().min(2).max(128).nullable(),
})

/** Opens every sealed list of an unrevealed event for `actorId`, or says why it cannot, checking the rosters themselves beyond the checklist. */
function revealLeagueEvent(tx: Context, event: LeagueEventRow, now: number, actorId: string) {
  const all = leagueEntriesFor(tx, event.id)
  const sealBy = event.sealBy === undefined ? null : safeNumber(event.sealBy)
  // Past the roster deadline only those who sealed in time play, so the rest neither hold up the reveal nor join it.
  const entries = all.filter(
    (entry) => entry.status === 'accepted' && (!leagueSealingClosed({ sealBy }, now) || entry.rosterSnapshot !== undefined),
  )
  const checks = leagueRevealChecklist(
    { format: (event.format ?? null) as TableShape | null, rosterLimit: event.rosterLimit ?? null, sealBy },
    leagueRevealEntries(tx, event.id, all),
    now,
  )
  if (!checks.every((check) => check.done)) return { outcome: 'not-ready' as const }
  let snapshots: Roster[] = []
  if (event.format !== undefined) {
    try {
      snapshots = entries.map((entry) => parseRosterSnapshot(entry.rosterSnapshot!))
    } catch {
      return { outcome: 'not-ready' as const }
    }
  }
  const allowances = leagueEventAllowances(event)
  if (
    event.format !== undefined &&
    snapshots.some((snapshot) => !leagueWarlordWaived(snapshot, allowances) && !leagueWarlordValid(snapshot, true))
  )
    return { outcome: 'invalid-warlords' as const, format: event.format }
  if (
    event.format !== undefined &&
    entries.some((entry, index) => {
      const required = requiredLeagueRosterLimit(
        event.format as TableShape,
        event.rosterLimit ?? null,
        entry.requiredLimit ?? null,
        entry.teamId ?? null,
      )
      return required === null || snapshots[index]!.built?.limit !== required
    })
  )
    return { outcome: 'not-ready' as const }
  for (const entry of all.filter((row) => row.status === 'pending')) tx.db.leagueEventEntries.key.update({ ...entry, status: 'rejected' })
  // Recorded outright, so the card a pair agreed on by default survives one of its lists being unsealed.
  for (const team of eventTeams(tx, event.id, all)) {
    if (team.disposition) setTeamPick(tx, event.id, team.id, team.disposition)
    if (team.warlord) setTeamWarlord(tx, event.id, team.id, team.warlord)
  }
  tx.db.leagueEvents.id.update({ ...event, revealedAt: BigInt(now), revealedBy: actorId })
  return { outcome: 'revealed' as const, entrantIds: entries.map((entry) => entry.userId) }
}

function leagueRevealEntries(ctx: Context, eventId: string, entries: LeagueEntryRow[]) {
  const teams = eventTeams(ctx, eventId, entries)
  const owing = new Set(teams.flatMap((team) => (team.owed ? team.userIds : [])))
  const leaderless = new Set(teams.flatMap((team) => (team.warlordOwed ? team.userIds : [])))
  return entries.map((entry) => ({
    userId: entry.userId,
    status: entry.status as LeagueEntryStatus,
    submitted: entry.rosterSnapshot !== undefined,
    requiredLimit: entry.requiredLimit ?? null,
    teamId: entry.teamId ?? null,
    dispositionOwed: owing.has(entry.userId),
    warlordOwed: leaderless.has(entry.userId),
  }))
}

/** An event's fixed pairs with the card each plays, from their sealed lists and the picks recorded for them. */
function eventTeams(ctx: Context, eventId: string, entries: LeagueEntryRow[]) {
  const picks = new Map(Array.from(ctx.db.leagueEventTeams.eventId.filter(eventId), (row) => [row.teamId, row.disposition]))
  const warlords = new Map(Array.from(ctx.db.leagueEventTeamWarlords.eventId.filter(eventId), (row) => [row.teamId, row.userId]))
  return leagueTeams(
    entries.map((entry) => ({
      userId: entry.userId,
      status: entry.status as LeagueEntryStatus,
      teamId: entry.teamId ?? null,
      roster: entry.teamId ? sealedRoster(entry) : null,
    })),
    picks,
    warlords,
  )
}

function sealedRoster(entry: LeagueEntryRow) {
  if (entry.rosterSnapshot === undefined) return null
  try {
    return parseRosterSnapshot(entry.rosterSnapshot)
  } catch {
    return null
  }
}

function setTeamPick(ctx: Context, eventId: string, teamId: string, disposition: string) {
  const key = JSON.stringify([eventId, teamId])
  const row = { key, eventId, teamId, disposition }
  if (ctx.db.leagueEventTeams.key.find(key)) ctx.db.leagueEventTeams.key.update(row)
  else ctx.db.leagueEventTeams.insert(row)
}

function setTeamWarlord(ctx: Context, eventId: string, teamId: string, userId: string) {
  const key = JSON.stringify([eventId, teamId])
  const row = { key, eventId, teamId, userId }
  if (ctx.db.leagueEventTeamWarlords.key.find(key)) ctx.db.leagueEventTeamWarlords.key.update(row)
  else ctx.db.leagueEventTeamWarlords.insert(row)
}

function clearTeamPicks(ctx: Context, eventId: string, teamIds?: ReadonlySet<string>) {
  for (const row of Array.from(ctx.db.leagueEventTeams.eventId.filter(eventId)))
    if (!teamIds || teamIds.has(row.teamId)) ctx.db.leagueEventTeams.key.delete(row.key)
  for (const row of Array.from(ctx.db.leagueEventTeamWarlords.eventId.filter(eventId)))
    if (!teamIds || teamIds.has(row.teamId)) ctx.db.leagueEventTeamWarlords.key.delete(row.key)
}

export const leagueCommand = spacetime.procedure({ payload: t.string() }, t.string(), (ctx, { payload }) =>
  ctx.withTx((tx) => leagueCommandIn(tx, [payload])),
)

const clubDetailsInput = z.object({
  name: z.string().min(1).max(CLUB_NAME_MAX_LENGTH),
  description: z.string().max(CLUB_DESCRIPTION_MAX_LENGTH),
  visibility: z.enum(LEAGUE_VISIBILITIES),
  admission: z.enum(LEAGUE_ADMISSIONS),
})

const clubCommandInput = z.discriminatedUnion('op', [
  clubDetailsInput.extend({ op: z.literal('create'), id: idInput, token: idInput, ownerId: idInput, now: leagueTimeInput }),
  clubDetailsInput.extend({ op: z.literal('update'), token: idInput, actorId: idInput }),
  z.object({ op: z.literal('delete'), token: idInput, actorId: idInput }),
  z.object({ op: z.literal('join'), token: idInput, userId: idInput, now: leagueTimeInput }),
  z.object({ op: z.literal('leave'), token: idInput, userId: idInput }),
  z.object({ op: z.literal('moderate'), token: idInput, actorId: idInput, userId: idInput, accept: z.boolean() }),
  z.object({ op: z.literal('remove'), token: idInput, actorId: idInput, userId: idInput }),
  z.object({ op: z.literal('set-admins'), token: idInput, actorId: idInput, userIds: z.array(idInput).max(CLUB_ADMIN_MAX) }),
])

type ClubRow = NonNullable<ReturnType<Context['db']['clubs']['id']['find']>>

function clubMembersOf(ctx: Context, clubId: string) {
  return Array.from(ctx.db.clubMembers.clubId.filter(clubId)).sort((a, b) =>
    a.joinedAt < b.joinedAt ? -1 : a.joinedAt > b.joinedAt ? 1 : a.userId.localeCompare(b.userId),
  )
}

function clubMemberRows(ctx: Context, club: ClubRow) {
  return clubMembersOf(ctx, club.id).map((row) => ({
    userId: row.userId,
    status: row.status as ClubMemberStatus,
    role: row.role as ClubRole,
    joinedAt: row.joinedAt,
  }))
}

function insertClubMember(ctx: Context, clubId: string, userId: string, status: ClubMemberStatus, now: number) {
  ctx.db.clubMembers.insert({ key: JSON.stringify([clubId, userId]), clubId, userId, status, role: 'member', joinedAt: BigInt(now) })
}

function clubCommandIn(tx: Context, args: unknown[]) {
  const [payload] = z.tuple([textArg]).parse(args)

  requireOperator(tx)
  const input = decodePayload(clubCommandInput, payload, 'Invalid club command')
  if (input.op === 'create') {
    tx.db.clubs.insert({
      id: input.id,
      token: input.token,
      ownerId: input.ownerId,
      name: input.name,
      description: input.description,
      visibility: input.visibility,
      admission: input.admission,
      createdAt: BigInt(input.now),
    })
    insertClubMember(tx, input.id, input.ownerId, 'accepted', input.now)
    touchClub(tx, input.id)
    return productJson('created')
  }
  const club = tx.db.clubs.token.find(input.token)
  if (!club) return productJson('missing')
  const members = clubMemberRows(tx, club)
  const memberKey = (userId: string) => JSON.stringify([club.id, userId])

  if (input.op === 'join') {
    const existing = tx.db.clubMembers.key.find(memberKey(input.userId))
    if (existing) return productJson({ status: existing.status, organizerIds: [] })
    if (members.length >= CLUB_MEMBER_MAX) return productJson('full')
    const status = club.admission === 'automatic' ? 'accepted' : 'pending'
    insertClubMember(tx, club.id, input.userId, status, input.now)
    touchClub(tx, club.id)
    const organizerIds =
      status === 'pending' ? members.filter((member) => isClubOrganizer(club, members, member.userId)).map((member) => member.userId) : []
    return productJson({ status, organizerIds })
  }
  if (input.op === 'leave') {
    if (input.userId === club.ownerId) return productJson('owner')
    if (!tx.db.clubMembers.key.find(memberKey(input.userId))) return productJson('missing')
    touchClub(tx, club.id)
    tx.db.clubMembers.key.delete(memberKey(input.userId))
    return productJson('left')
  }

  const owner = input.actorId === club.ownerId
  if (!(input.op === 'delete' || input.op === 'set-admins' ? owner : isClubOrganizer(club, members, input.actorId)))
    return productJson('forbidden')

  if (input.op === 'update') {
    tx.db.clubs.id.update({
      ...club,
      name: input.name,
      description: input.description,
      visibility: input.visibility,
      admission: input.admission,
    })
    // Opening the door lets in everyone already waiting at it.
    const admitted = input.admission === 'automatic' ? members.filter((member) => member.status === 'pending') : []
    for (const member of admitted) {
      const row = tx.db.clubMembers.key.find(memberKey(member.userId))
      if (row) tx.db.clubMembers.key.update({ ...row, status: 'accepted' })
    }
    touchClub(tx, club.id)
    return productJson({ admitted: admitted.map((member) => member.userId) })
  }
  if (input.op === 'delete') {
    deleteClub(tx, club.id)
    return productJson('deleted')
  }
  if (input.op === 'moderate') {
    const row = tx.db.clubMembers.key.find(memberKey(input.userId))
    if (!row || row.status !== 'pending') return productJson('missing')
    if (input.accept) tx.db.clubMembers.key.update({ ...row, status: 'accepted' })
    else tx.db.clubMembers.key.delete(row.key)
    touchClub(tx, club.id)
    touchProduct(tx, input.userId, 'clubs')
    return productJson(input.accept ? 'accepted' : 'rejected')
  }
  if (input.op === 'remove') {
    const row = tx.db.clubMembers.key.find(memberKey(input.userId))
    if (!row) return productJson('missing')
    // Only the owner removes an admin, so admins cannot remove each other.
    if (input.userId === club.ownerId || (row.role === 'admin' && !owner)) return productJson('forbidden')
    touchClub(tx, club.id)
    tx.db.clubMembers.key.delete(row.key)
    return productJson('removed')
  }
  const userIds = new Set(input.userIds)
  if (
    [...userIds].some(
      (userId) => userId === club.ownerId || !members.some((member) => member.userId === userId && member.status === 'accepted'),
    )
  )
    return productJson('not-members')
  const added: string[] = []
  for (const member of members) {
    if (member.userId === club.ownerId) continue
    const role = userIds.has(member.userId) ? 'admin' : 'member'
    if (role === member.role) continue
    if (role === 'admin') added.push(member.userId)
    const row = tx.db.clubMembers.key.find(memberKey(member.userId))
    if (row) tx.db.clubMembers.key.update({ ...row, role })
  }
  touchClub(tx, club.id)
  return productJson({ added })
}

export const clubCommand = spacetime.procedure({ payload: t.string() }, t.string(), (ctx, { payload }) =>
  ctx.withTx((tx) => clubCommandIn(tx, [payload])),
)

export const clubByToken = spacetime.procedure({ token: t.string() }, t.string(), (ctx, { token }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (token.length > MAX_ID_LENGTH) throw new SenderError('Invalid club token')
    const club = tx.db.clubs.token.find(token)
    if (!club) return productJson(null)
    return productJson({
      club,
      members: clubMemberRows(tx, club),
      tournaments: clubTournaments(tx, club.id).map((league) => {
        const event = leagueEventFor(tx, league.id, null)
        return {
          token: league.token,
          name: league.name,
          createdAt: league.createdAt,
          revealedAt: event?.revealedAt ?? null,
          eventTokens: Array.from(tx.db.leagueEvents.leagueId.filter(league.id), (row) => row.token),
        }
      }),
    })
  }),
)

/** Public clubs and every club a player owns, belongs to, or has asked to join, their own first. */
export const clubsVisibleTo = spacetime.procedure({ userId: t.string(), limit: t.u32() }, t.string(), (ctx, { userId, limit }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (userId.length > MAX_ID_LENGTH || limit < 1 || limit > 100) throw new SenderError('Invalid club list')
    const own = new Map(userId ? Array.from(tx.db.clubMembers.userId.filter(userId), (row) => [row.clubId, row] as const) : [])
    const clubs = []
    let scanned = 0
    for (const club of tx.db.clubs.iter()) {
      if (++scanned > 100_000) throw new SenderError('Club list is too large')
      if (club.visibility === 'public' || own.has(club.id)) clubs.push(club)
    }
    clubs.sort((a, b) => Number(own.has(b.id)) - Number(own.has(a.id)) || Number(b.createdAt - a.createdAt))
    return productJson(
      clubs.slice(0, limit).map((club) => {
        const members = clubMemberRows(tx, club)
        const ownMember = own.get(club.id)
        return {
          club,
          adminIds: members.filter((member) => member.role === 'admin').map((member) => member.userId),
          memberCount: members.filter((member) => member.status === 'accepted').length,
          battleCount: new Set(clubBattleIds(tx, club.id)).size,
          ownMember: ownMember ? { status: ownMember.status, role: ownMember.role } : null,
        }
      }),
    )
  }),
)

/** The club a battle counts for, and the clubs it could, for its setup. */
export const battleClubs = spacetime.procedure({ battleId: t.string() }, t.string(), (ctx, { battleId }) =>
  ctx.withTx((tx) => {
    requireOperator(tx)
    if (battleId.length > MAX_ID_LENGTH) throw new SenderError('Invalid battle')
    const summary = (club: ClubRow) => ({ id: club.id, token: club.token, name: club.name, visibility: club.visibility })
    const currentId = tx.db.clubBattles.battleId.find(battleId)?.clubId
    const current = currentId ? tx.db.clubs.id.find(currentId) : undefined
    return productJson({
      current: current ? summary(current) : null,
      options: battleClubIds(tx, battleData(tx, battleId).seats).flatMap((clubId) => {
        const club = tx.db.clubs.id.find(clubId)
        return club ? [summary(club)] : []
      }),
    })
  }),
)

/** Saved actions replay through the same functions as live calls, so arguments arrive untyped. */
const textArg = z.string().max(2_000_000)
const timestampArg = z.preprocess(
  (value) => (typeof value === 'bigint' ? safeNumber(value) : value),
  z.number().int().nonnegative().transform(BigInt),
)

function createBattleIn(tx: Context, args: unknown[]) {
  const [payload] = z.tuple([textArg]).parse(args)

  requireOperator(tx)
  const { id, token, userId, allyIds, opponentIds, guestNames, initialCommands, now } = decodePayload(newBattle, payload, 'Invalid battle')
  const seats: { id: string; side: number; guestName?: string }[] = [
    { id: userId, side: 0 },
    ...allyIds.map((seatId) => ({ id: seatId, side: 0 })),
    ...opponentIds.map((seatId) => ({ id: seatId, side: 1 })),
    ...guestNames.map((guestName, at) => ({ id: guestSeatId(id, at), side: 1, guestName })),
  ]
  if (
    seats.length > 4 ||
    !seats.some((seat) => seat.side === 1) ||
    [userId, ...allyIds, ...opponentIds].some(isGuestSeat) ||
    new Set(seats.map((seat) => seat.id)).size !== seats.length
  )
    throw new SenderError('Invalid battle seats')
  tx.db.battles.insert({ id, token, createdAt: BigInt(now) })
  for (const [index, seat] of seats.entries()) {
    tx.db.battleUsers.insert({
      key: JSON.stringify([id, seat.id]),
      battleId: id,
      userId: seat.id,
      side: seat.side,
      joinedAt: BigInt(now + index),
      guestName: seat.guestName,
      claimedSeat: undefined,
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
    const refusal = command.kind === 'set-battle-club' ? 'a club is chosen during setup' : validate(state, userId, command)
    if (refusal) throw new SenderError(`new battle command was refused: ${refusal}`)
    const seq = index + 1
    tx.db.commands.insert({ key: JSON.stringify([id, seq]), battleId: id, seq, userId, at: BigInt(now), body: JSON.stringify(command) })
    log.push({ seq, by: userId, at: now, command })
  }
  return productJson(battleData(tx, id))
}

function removeBattleIn(tx: Context, args: unknown[]) {
  const [battleId, userId] = z.tuple([textArg, textArg]).parse(args)

  requireOperator(tx)
  const opener = Array.from(tx.db.battleUsers.battleId.filter(battleId))
    .filter((seat) => seat.side === 0)
    .sort((left, right) => (left.joinedAt > right.joinedAt ? 1 : left.joinedAt < right.joinedAt ? -1 : 0))[0]
  if (!opener || opener.userId !== userId) return false
  deleteBattle(tx, battleId)
  return true
}

function requestFriendIn(tx: Context, args: unknown[]) {
  const [requesterId, addresseeId, now] = z.tuple([textArg, textArg, timestampArg]).parse(args)

  requireOperator(tx)
  const key = friendshipKey(requesterId, addresseeId)
  if (friendshipBetween(tx, requesterId, addresseeId)) return false
  tx.db.friendships.insert({
    key,
    requesterId,
    addresseeId,
    requestedAt: now,
    acceptedAt: undefined,
  })
  touchFriends(tx, requesterId, addresseeId)
  return true
}

function acceptFriendIn(tx: Context, args: unknown[]) {
  const [requesterId, addresseeId, now] = z.tuple([textArg, textArg, timestampArg]).parse(args)

  requireOperator(tx)
  const current = tx.db.friendships.key.find(friendshipKey(requesterId, addresseeId))
  if (!current || current.acceptedAt !== undefined) return false
  tx.db.friendships.key.update({ ...current, acceptedAt: now })
  touchFriends(tx, requesterId, addresseeId)
  return true
}

function rejectFriendIn(tx: Context, args: unknown[]) {
  const [requesterId, addresseeId] = z.tuple([textArg, textArg]).parse(args)

  requireOperator(tx)
  const current = tx.db.friendships.key.find(friendshipKey(requesterId, addresseeId))
  if (!current || current.requesterId !== requesterId || current.addresseeId !== addresseeId || current.acceptedAt !== undefined)
    return false
  const deleted = tx.db.friendships.key.delete(current.key)
  if (deleted) touchFriends(tx, requesterId, addresseeId)
  return deleted
}

function removeFriendIn(tx: Context, args: unknown[]) {
  const [leftId, rightId] = z.tuple([textArg, textArg]).parse(args)

  requireOperator(tx)
  const current = friendshipBetween(tx, leftId, rightId)
  if (!current) return false
  const deleted = tx.db.friendships.key.delete(current.key)
  if (deleted) touchFriends(tx, current.requesterId, current.addresseeId)
  for (const [ownerId, borrowerId] of [
    [leftId, rightId],
    [rightId, leftId],
  ] as const)
    for (const loan of Array.from(tx.db.rosterLoans.borrowerId.filter(borrowerId))) if (loan.ownerId === ownerId) endLoan(tx, loan)
  return deleted
}

function replaceFriendInviteIn(ctx: Context, args: unknown[]) {
  const [inviterId, token, now] = z.tuple([textArg, textArg, timestampArg]).parse(args)

  requireOperator(ctx)
  if (!validId(inviterId) || !validId(token)) throw new SenderError('Invalid invite')
  const current = ctx.db.friendInvites.inviterId.find(inviterId)
  if (current) ctx.db.friendInvites.token.delete(current.token)
  ctx.db.friendInvites.insert({ inviterId, token, createdAt: now })
  touchProduct(ctx, inviterId, 'invites')
  touchPublic(ctx, 'invites')
}

function cancelFriendInviteIn(tx: Context, args: unknown[]) {
  const [inviterId] = z.tuple([textArg]).parse(args)

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
  const [token, recipientId, now] = z.tuple([textArg, textArg, timestampArg]).parse(args)

  requireOperator(tx)
  const invite = tx.db.friendInvites.token.find(token)
  if (!invite) return productJson('missing')
  if (invite.inviterId === recipientId) return productJson('self')
  const relationship = friendshipBetween(tx, invite.inviterId, recipientId)
  if (relationship?.acceptedAt !== undefined) return productJson('already-friends')
  if (relationship) tx.db.friendships.key.update({ ...relationship, acceptedAt: now })
  else {
    tx.db.friendships.insert({
      key: friendshipKey(invite.inviterId, recipientId),
      requesterId: invite.inviterId,
      addresseeId: recipientId,
      requestedAt: now,
      acceptedAt: now,
    })
  }
  tx.db.friendInvites.token.delete(token)
  touchFriends(tx, invite.inviterId, recipientId)
  touchProduct(tx, invite.inviterId, 'invites')
  touchPublic(tx, 'invites')
  return productJson({ inviterId: invite.inviterId })
}

function updateOnboardingIn(tx: Context, args: unknown[]) {
  const [userId, operation, task] = z.tuple([textArg, textArg, textArg]).parse(args)

  requireOperator(tx)
  if (!validId(userId)) throw new SenderError('Invalid user ID')
  if (operation === 'welcome') {
    const current = tx.db.userOnboarding.userId.find(userId)
    if (current) tx.db.userOnboarding.userId.update({ ...current, welcomed: true })
    else tx.db.userOnboarding.insert({ userId, welcomed: true })
  } else {
    if (!(onboardingTaskIds as readonly string[]).includes(task)) throw new SenderError('Invalid onboarding task')
    if (operation === 'complete' && !(tourTaskIds as readonly string[]).includes(task)) {
      throw new SenderError('Invalid onboarding completion')
    }
    const key = JSON.stringify([userId, task])
    const current = tx.db.userOnboardingTasks.key.find(key)
    if (operation === 'restore') {
      if (current?.state === 'skipped') tx.db.userOnboardingTasks.key.delete(key)
    } else if (operation === 'skip' || operation === 'complete') {
      const row = { key, userId, task, state: operation === 'skip' ? 'skipped' : 'completed' }
      if (current) tx.db.userOnboardingTasks.key.update(row)
      else tx.db.userOnboardingTasks.insert(row)
    } else throw new SenderError('Invalid onboarding operation')
  }
  touchProduct(tx, userId, 'onboarding')
  return productJson(onboardingData(tx, userId))
}

function migrateCollectionHeart(ctx: Context, row: { key: string; userId: string; entryId: string; at: bigint; models?: number }) {
  if (row.models !== undefined) return false
  const key = JSON.stringify([row.userId, row.entryId])
  if (!ctx.db.favouriteDatasheets.key.find(key))
    ctx.db.favouriteDatasheets.insert({ key, userId: row.userId, entryId: row.entryId, at: row.at })
  dropCollectionRowPhotos(ctx, row.key)
  ctx.db.collection.key.delete(row.key)
  return true
}

function moveHeartsToFavourites(ctx: Context, userId: string) {
  const hearts = Array.from(ctx.db.collection.userId.filter(userId)).filter((row) => migrateCollectionHeart(ctx, row))
  if (hearts.length) touchProduct(ctx, userId, 'collection', 'favourites')
}

function addToCollectionIn(ctx: Context, args: unknown[]) {
  const [userId, entryId, at] = z.tuple([textArg, textArg, timestampArg]).parse(args)

  requireOperator(ctx)
  moveHeartsToFavourites(ctx, userId)
  const key = JSON.stringify([userId, entryId])
  if (!ctx.db.collection.key.find(key)) {
    ctx.db.collection.insert({ key, userId, entryId, at, models: 1, built: undefined, painted: undefined, countsAs: undefined })
    touchCollection(ctx, userId)
  }
}

function removeFromCollectionIn(ctx: Context, args: unknown[]) {
  const [userId, entryId] = z.tuple([textArg, textArg]).parse(args)

  requireOperator(ctx)
  moveHeartsToFavourites(ctx, userId)
  const key = JSON.stringify([userId, entryId])
  dropCollectionRowPhotos(ctx, key)
  if (ctx.db.collection.key.delete(key)) touchCollection(ctx, userId)
}

function setCollectionModelsIn(ctx: Context, args: unknown[]) {
  const [userId, entryId, models, at] = z
    .tuple([textArg, textArg, z.number().int().min(1).max(MAX_COLLECTION_MODELS), timestampArg])
    .parse(args)

  requireOperator(ctx)
  moveHeartsToFavourites(ctx, userId)
  const key = JSON.stringify([userId, entryId])
  const current = ctx.db.collection.key.find(key)
  if (current)
    ctx.db.collection.key.update({
      ...current,
      models,
      ...boundedProgress(models, { built: current.built ?? 0, painted: current.painted ?? 0 }),
    })
  else ctx.db.collection.insert({ key, userId, entryId, at, models, built: undefined, painted: undefined, countsAs: undefined })
  touchCollection(ctx, userId)
}

/** Counts above what is owned are lowered rather than refused, because another device may have lowered the owned count first. */
function setCollectionProgressIn(ctx: Context, args: unknown[]) {
  const [userId, entryId, built, painted] = z
    .tuple([textArg, textArg, z.number().int().min(0).max(MAX_COLLECTION_MODELS), z.number().int().min(0).max(MAX_COLLECTION_MODELS)])
    .parse(args)

  requireOperator(ctx)
  moveHeartsToFavourites(ctx, userId)
  const current = ctx.db.collection.key.find(JSON.stringify([userId, entryId]))
  if (!current) throw new SenderError('Add this datasheet to your collection before counting built or painted models')
  ctx.db.collection.key.update({ ...current, ...boundedProgress(current.models ?? 1, { built, painted }) })
  touchCollection(ctx, userId)
}

function setCollectionCountsAsIn(ctx: Context, args: unknown[]) {
  const [userId, entryId, countsAs] = z.tuple([textArg, textArg, z.array(countsAsId).max(MAX_COUNTS_AS)]).parse(args)

  requireOperator(ctx)
  moveHeartsToFavourites(ctx, userId)
  const current = ctx.db.collection.key.find(JSON.stringify([userId, entryId]))
  if (!current) throw new SenderError('Add this datasheet to your collection before choosing what else its models can be')
  const links = countsAsList(entryId, countsAs)
  ctx.db.collection.key.update({ ...current, countsAs: links.length ? links : undefined })
  touchCollection(ctx, userId)
}

function setCollectionWantedIn(ctx: Context, args: unknown[]) {
  const [userId, entryId, wanted, at] = z
    .tuple([textArg, textArg, z.number().int().min(0).max(MAX_COLLECTION_MODELS), timestampArg])
    .parse(args)

  requireOperator(ctx)
  const key = JSON.stringify([userId, entryId])
  const current = ctx.db.collectionWishes.key.find(key)
  if (!wanted) {
    if (!ctx.db.collectionWishes.key.delete(key)) return
  } else if (current) ctx.db.collectionWishes.key.update({ ...current, wanted })
  else ctx.db.collectionWishes.insert({ key, userId, entryId, wanted, at })
  touchCollection(ctx, userId)
}

function addFavouriteFactionIn(ctx: Context, args: unknown[]) {
  const [userId, catalogueId, at] = z.tuple([textArg, textArg, timestampArg]).parse(args)

  requireOperator(ctx)
  const key = JSON.stringify([userId, catalogueId])
  if (!ctx.db.favouriteFactions.key.find(key)) {
    ctx.db.favouriteFactions.insert({ key, userId, catalogueId, at })
    touchProduct(ctx, userId, 'favourites')
  }
}

function removeFavouriteFactionIn(ctx: Context, args: unknown[]) {
  const [userId, catalogueId] = z.tuple([textArg, textArg]).parse(args)

  requireOperator(ctx)
  if (ctx.db.favouriteFactions.key.delete(JSON.stringify([userId, catalogueId]))) touchProduct(ctx, userId, 'favourites')
}

function addFavouriteDatasheetIn(ctx: Context, args: unknown[]) {
  const [userId, entryId, at] = z.tuple([textArg, textArg, timestampArg]).parse(args)

  requireOperator(ctx)
  const key = JSON.stringify([userId, entryId])
  if (!ctx.db.favouriteDatasheets.key.find(key)) {
    ctx.db.favouriteDatasheets.insert({ key, userId, entryId, at })
    touchProduct(ctx, userId, 'favourites')
  }
}

function removeFavouriteDatasheetIn(ctx: Context, args: unknown[]) {
  const [userId, entryId] = z.tuple([textArg, textArg]).parse(args)

  requireOperator(ctx)
  if (ctx.db.favouriteDatasheets.key.delete(JSON.stringify([userId, entryId]))) touchProduct(ctx, userId, 'favourites')
}

function recentMatchupsOf(ctx: Context, userId: string) {
  return Array.from(ctx.db.recentMatchups.userId.filter(userId)).sort((a, b) => (a.at === b.at ? 0 : a.at > b.at ? -1 : 1))
}

function rememberMatchupIn(ctx: Context, args: unknown[]) {
  const { shape } = recentMatchupSchema
  const [userId, pairing, shared, attacker, defender, at] = z
    .tuple([idInput, matchupPairingSchema, shape.shared, shape.attacker, shape.defender, timestampArg])
    .parse(args)

  requireOperator(ctx)
  const key = JSON.stringify([userId, pairing])
  const row = { key, userId, shared, attacker, defender, at }
  if (ctx.db.recentMatchups.key.find(key)) ctx.db.recentMatchups.key.update(row)
  else ctx.db.recentMatchups.insert(row)
  for (const old of recentMatchupsOf(ctx, userId).slice(RECENT_MATCHUP_LIMIT)) ctx.db.recentMatchups.key.delete(old.key)
  touchProduct(ctx, userId, 'simulator')
}

function forgetMatchupIn(ctx: Context, args: unknown[]) {
  const [userId, pairing] = z.tuple([idInput, matchupPairingSchema]).parse(args)

  requireOperator(ctx)
  if (ctx.db.recentMatchups.key.delete(JSON.stringify([userId, pairing]))) touchProduct(ctx, userId, 'simulator')
}

function addFavouriteDetachmentIn(ctx: Context, args: unknown[]) {
  const [userId, catalogueId, detachmentId, at] = z.tuple([textArg, textArg, textArg, timestampArg]).parse(args)

  requireOperator(ctx)
  const key = JSON.stringify([userId, catalogueId, detachmentId])
  if (!ctx.db.favouriteDetachments.key.find(key)) {
    ctx.db.favouriteDetachments.insert({ key, userId, catalogueId, detachmentId, at })
    touchProduct(ctx, userId, 'favourites')
  }
}

function removeFavouriteDetachmentIn(ctx: Context, args: unknown[]) {
  const [userId, catalogueId, detachmentId] = z.tuple([textArg, textArg, textArg]).parse(args)

  requireOperator(ctx)
  if (ctx.db.favouriteDetachments.key.delete(JSON.stringify([userId, catalogueId, detachmentId]))) touchProduct(ctx, userId, 'favourites')
}

function setPushEnabledIn(tx: Context, args: unknown[]) {
  const [userId, enabled, now] = z.tuple([textArg, z.boolean(), timestampArg]).parse(args)

  requireOperator(tx)
  if (!validId(userId)) throw new SenderError('Invalid user ID')
  const current = tx.db.pushPreferences.userId.find(userId)
  const row = { userId, enabled, at: now }
  if (current) tx.db.pushPreferences.userId.update(row)
  else tx.db.pushPreferences.insert(row)
  touchProduct(tx, userId, 'settings')
  return enabled
}

function setPlayerDefaultsIn(tx: Context, args: unknown[]) {
  const [userId, rosterVisibility, battleSize, now] = z
    .tuple([textArg, textArg, z.number().int().nonnegative().max(4_294_967_295), timestampArg])
    .parse(args)

  requireOperator(tx)
  if (!validId(userId) || !isPlayerDefaults({ rosterVisibility, battleSize })) throw new SenderError('Invalid player defaults')
  const row = { userId, rosterVisibility, battleSize, at: now }
  if (tx.db.playerDefaults.userId.find(userId)) tx.db.playerDefaults.userId.update(row)
  else tx.db.playerDefaults.insert(row)
  touchProduct(tx, userId, 'settings')
  return productJson({ rosterVisibility: row.rosterVisibility, battleSize: row.battleSize })
}

function leagueCommandIn(tx: Context, args: unknown[]) {
  const [payload] = z.tuple([textArg]).parse(args)

  requireOperator(tx)
  const value = decodePayload(z.unknown(), payload, 'Invalid league command')
  const operation = leagueCommandInput(z.object({ op: z.string() }), value).op
  if (operation === 'create') {
    const input = leagueCommandInput(
      leagueDetailsInput.extend({
        op: z.literal('create'),
        id: idInput,
        token: idInput,
        eventId: idInput,
        eventToken: idInput,
        ownerId: idInput,
        recurring: z.boolean(),
        format: leagueFormatInput.nullable(),
        rosterLimit: z.number().int().positive().max(10_000).nullable(),
        allowances: leagueAllowancesSchema.default([]),
        ownerPlays: z.boolean().default(false),
        clubToken: idInput.optional(),
        rounds: leagueRoundsInput.default(null),
        pointsBudget: leaguePointsBudgetInput.default(null),
        schedule: leagueScheduleInput.default({ playsAt: null, sealBy: null }),
        now: leagueTimeInput,
      }),
      value,
    )
    if (!leaguePlacesSeat(input.format, input.playerLimit)) return productJson('too-small')
    if (input.rounds !== null && (input.clubToken || (input.format ?? '1v1') !== '1v1')) return productJson('forbidden')
    const points = leaguePointsBudget(input.format ?? '1v1', input.rosterLimit, input.pointsBudget)
    if (!points) return productJson('forbidden')
    const club = input.clubToken ? tx.db.clubs.token.find(input.clubToken) : undefined
    if (input.clubToken && (!club || !isClubOrganizer(club, clubMemberRows(tx, club), input.ownerId))) return productJson('forbidden')
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
      clubId: club?.id,
    })
    if (club) touchClub(tx, club.id)
    tx.db.leagueEvents.insert({
      id: input.eventId,
      token: input.eventToken,
      leagueId: input.id,
      number: 1,
      format: input.format ?? undefined,
      rosterLimit: input.rosterLimit ?? undefined,
      createdAt: BigInt(input.now),
      revealedAt: undefined,
      revealedBy: undefined,
      allowances: JSON.stringify(input.allowances),
      rounds: input.rounds ?? undefined,
      pointsBudget: points.budget,
      playsAt: input.schedule.playsAt === null ? undefined : BigInt(input.schedule.playsAt),
      sealBy: input.schedule.sealBy === null ? undefined : BigInt(input.schedule.sealBy),
    })
    if (input.ownerPlays) insertLeagueEntry(tx, input.eventId, input.ownerId, 'accepted', input.now)
    touchProduct(tx, input.ownerId, 'leagues', 'onboarding')
    touchPublic(tx, 'leagues')
    return 'null'
  }
  const base = leagueCommandInput(z.object({ token: idInput }), value)
  const league = tx.db.leagues.token.find(base.token)
  if (operation === 'join') {
    const input = leagueCommandInput(
      z.object({
        op: z.literal('join'),
        token: idInput,
        eventToken: z.string().max(MAX_ID_LENGTH),
        userId: idInput,
        now: leagueTimeInput,
        memberLimit: z.number().int().min(2).max(128),
        noticeResults: z.boolean().optional(),
      }),
      value,
    )
    if (!league) return productJson('missing')
    const event = leagueEventFor(tx, league.id, input.eventToken || null)
    if (!event) return productJson('missing')
    // Past the roster deadline a newcomer could never seal, so entry closes with it.
    if (event.revealedAt !== undefined || (event.sealBy !== undefined && BigInt(input.now) > event.sealBy)) return productJson('closed')
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
    const organizers = [league.ownerId, ...leagueAdminIds(tx, league.id)]
    const status = league.admission === 'automatic' || organizers.includes(input.userId) ? 'accepted' : 'pending'
    if (existing) tx.db.leagueEventEntries.key.update({ ...existing, status, joinedAt: BigInt(input.now) })
    else insertLeagueEntry(tx, event.id, input.userId, status, input.now)
    touchLeague(tx, league.id, event.id)
    return productJson(status === 'pending' && input.noticeResults ? { status, organizerIds: organizers } : status)
  }
  if (!league) return productJson(operation === 'reveal' ? { outcome: 'not-ready' } : 'missing')
  // `ownerId` names whoever acts: the owner, an admin, or for sealing, revealing and battles, an entrant.
  const ownerId = leagueCommandInput(z.object({ ownerId: idInput }), value).ownerId
  const organizer = isLeagueOrganizer(league, leagueAdminIds(tx, league.id), ownerId)
  const ownerOnly = operation === 'delete' || operation === 'set-admins'
  if (
    ownerOnly
      ? league.ownerId !== ownerId
      : ![
          'submit',
          'set-team-disposition',
          'set-team-warlord',
          'create-battle',
          'reveal',
          'share-roster',
          'dismiss-roster-sharing',
        ].includes(operation) && !organizer
  )
    return productJson('forbidden')

  if (operation === 'set-admins') {
    const input = leagueCommandInput(
      z.object({ op: z.literal('set-admins'), userIds: z.array(idInput).max(LEAGUE_ADMIN_MAX), now: leagueTimeInput }),
      value,
    )
    const userIds = [...new Set(input.userIds)]
    if (userIds.some((userId) => userId === league.ownerId || friendshipBetween(tx, league.ownerId, userId)?.acceptedAt === undefined))
      return productJson('not-friends')
    const current = Array.from(tx.db.leagueAdmins.leagueId.filter(league.id))
    for (const row of current) if (!userIds.includes(row.userId)) tx.db.leagueAdmins.key.delete(row.key)
    for (const userId of userIds) {
      if (current.some((row) => row.userId === userId)) continue
      tx.db.leagueAdmins.insert({ key: JSON.stringify([league.id, userId]), leagueId: league.id, userId, addedAt: BigInt(input.now) })
    }
    touchLeague(tx, league.id)
    for (const row of current) touchProduct(tx, row.userId, 'leagues')
    return productJson({ added: userIds.filter((userId) => !current.some((row) => row.userId === userId)) })
  }

  if (operation === 'create-event') {
    const input = leagueCommandInput(
      leagueDetailsInput.extend({
        op: z.literal('create-event'),
        id: idInput,
        eventToken: idInput,
        format: leagueFormatInput.nullable(),
        rosterLimit: z.number().int().positive().max(10_000).nullable(),
        allowances: leagueAllowancesSchema.default([]),
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
      allowances: JSON.stringify(input.allowances),
      createdAt: BigInt(input.now),
      revealedAt: undefined,
      revealedBy: undefined,
      rounds: undefined,
      pointsBudget: undefined,
      playsAt: undefined,
      sealBy: undefined,
    })
    if (input.ownerPlays) insertLeagueEntry(tx, input.id, ownerId, 'accepted', input.now)
    touchLeague(tx, league.id, latest.id)
    return productJson('created')
  }
  if (operation === 'update') {
    const input = leagueCommandInput(
      leagueDetailsInput.extend({
        op: z.literal('update'),
        rule: leagueRuleInput.nullable().default(null),
        // Absent from an older client, which leaves the date and the roster deadline as they stand.
        schedule: leagueScheduleInput.optional(),
      }),
      value,
    )
    const current = leagueEventFor(tx, league.id, null)
    if (!current) return productJson('missing')
    const entries = leagueEntriesFor(tx, current.id)
    const accepted = entries.filter((entry) => entry.status === 'accepted').length
    const rule =
      input.rule &&
      (input.rule.format !== current.format ||
        input.rule.rosterLimit !== current.rosterLimit ||
        (input.rule.allowances !== undefined && JSON.stringify(input.rule.allowances) !== JSON.stringify(leagueEventAllowances(current))))
        ? input.rule
        : null
    if (rule) {
      if (current.revealedAt !== undefined) return productJson('closed')
      if (entries.some((entry) => entry.rosterSnapshot !== undefined)) return productJson('sealed')
    }
    const format = (rule?.format ?? current.format ?? null) as TableShape | null
    if ((rule || input.playerLimit !== (league.playerLimit ?? null)) && current.revealedAt === undefined) {
      if (!leaguePlacesSeat(format, input.playerLimit)) return productJson('team-minimum')
      if (input.playerLimit !== null && input.playerLimit < accepted) return productJson('below-accepted')
    }
    if (rule) {
      const rounds = rule.rounds === undefined ? current.rounds : (rule.rounds ?? undefined)
      if (rounds !== undefined && (league.clubId !== undefined || rule.format !== '1v1')) return productJson('forbidden')
      const points =
        rule.pointsBudget === undefined
          ? { budget: rule.format === '1v1' && rule.rosterLimit === current.rosterLimit ? current.pointsBudget : undefined }
          : leaguePointsBudget(rule.format, rule.rosterLimit, rule.pointsBudget)
      if (!points) return productJson('forbidden')
      tx.db.leagueEvents.id.update({
        ...current,
        format: rule.format,
        rosterLimit: rule.rosterLimit,
        allowances: rule.allowances === undefined ? current.allowances : JSON.stringify(rule.allowances),
        rounds,
        pointsBudget: points.budget,
      })
      // Sizes and pairs follow the format and points; what lists may waive leaves them standing.
      if (rule.format !== current.format || rule.rosterLimit !== current.rosterLimit) {
        for (const entry of entries) tx.db.leagueEventEntries.key.update({ ...entry, requiredLimit: undefined, teamId: undefined })
        clearTeamPicks(tx, current.id)
      }
    }
    if (input.schedule) {
      // Read again, so a rule saved above is not written back over.
      const event = tx.db.leagueEvents.id.find(current.id)!
      tx.db.leagueEvents.id.update({
        ...event,
        playsAt: input.schedule.playsAt === null ? undefined : BigInt(input.schedule.playsAt),
        sealBy: input.schedule.sealBy === null ? undefined : BigInt(input.schedule.sealBy),
      })
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
  const eventToken = leagueCommandInput(z.object({ eventToken: z.string().max(MAX_ID_LENGTH) }), value).eventToken
  const event = leagueEventFor(tx, league.id, eventToken || null)
  if (!event) return productJson(operation === 'reveal' ? { outcome: 'not-ready' } : 'missing')
  if (operation === 'pair-round') {
    const input = leagueCommandInput(
      z.object({
        op: z.literal('pair-round'),
        round: z.number().int().min(1).max(SWISS_ROUNDS_MAX),
        pairs: z.array(z.tuple([idInput, idInput.nullable()])).max(128),
      }),
      value,
    )
    if (event.revealedAt === undefined || event.rounds === undefined) return productJson('not-ready')
    const pairings = roundPairings(tx, event.id)
    const latest = Math.max(0, ...pairings.map((pairing) => pairing.round))
    if (input.round !== latest + 1 || input.round > event.rounds) return productJson('stale')
    if (pairings.some((pairing) => pairing.round === latest && !pairingFinished(tx, pairing))) return productJson('not-ready')
    // Every entrant who sealed a list sits at exactly one table, and at most one sits the round out.
    const players = leagueEntriesFor(tx, event.id)
      .filter((entry) => entry.status === 'accepted' && entry.rosterSnapshot !== undefined)
      .map((entry) => entry.userId)
    const seated = input.pairs.flatMap(([a, b]) => (b === null ? [a] : [a, b]))
    if (
      seated.length !== players.length ||
      new Set(seated).size !== seated.length ||
      seated.some((id) => !players.includes(id)) ||
      input.pairs.filter(([, b]) => b === null).length > 1
    )
      return productJson('stale')
    for (const [index, [aId, bId]] of input.pairs.entries())
      tx.db.leagueRoundPairings.insert({
        key: JSON.stringify([event.id, input.round, index + 1]),
        eventId: event.id,
        round: input.round,
        table: index + 1,
        aId,
        bId: bId ?? undefined,
        battleId: undefined,
      })
    touchLeague(tx, league.id, event.id)
    return productJson('paired')
  }
  if (operation === 'share-roster' || operation === 'dismiss-roster-sharing') {
    const current = leagueRosterSharingState(tx, event, ownerId)
    if (!current) return productJson('unavailable')
    const key = current.entry.key
    const previous = tx.db.leagueRosterSharing.key.find(key)
    if (operation === 'share-roster') {
      const input = leagueCommandInput(
        z.object({
          submittedAt: leagueTimeInput,
          now: leagueTimeInput,
          rosterId: idInput,
        }),
        value,
      )
      if (current.state.submittedAt !== input.submittedAt || current.roster.id !== input.rosterId) return productJson('stale')
      const roster = current.roster
      if (roster.visibility !== 'public') {
        tx.db.rosters.id.update({
          ...roster,
          visibility: 'public',
          updatedAt: roster.updatedAt >= BigInt(input.now) ? roster.updatedAt + 1n : BigInt(input.now),
        })
        touchProduct(tx, ownerId, 'rosters')
        touchPublic(tx, 'rosters')
      }
    }
    const row = {
      key,
      eventId: event.id,
      userId: ownerId,
      rosterId: operation === 'share-roster' ? current.roster.id : previous?.rosterId,
    }
    if (previous) tx.db.leagueRosterSharing.key.update(row)
    else tx.db.leagueRosterSharing.insert(row)
    touchProduct(tx, ownerId, 'leagues')
    return productJson(leagueRosterSharingState(tx, event, ownerId)!.state)
  }
  if (operation === 'admit') {
    const input = leagueCommandInput(z.object({ op: z.literal('admit'), userIds: z.array(idInput).max(128) }), value)
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
        userIds: z.array(idInput).min(1).max(128),
        memberLimit: z.number().int().min(2).max(128),
        now: leagueTimeInput,
      }),
      value,
    )
    if (event.revealedAt !== undefined) return productJson('closed')
    const userIds = [...new Set(input.userIds)]
    if (userIds.some((userId) => userId === ownerId || friendshipBetween(tx, ownerId, userId)?.acceptedAt === undefined))
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
        userId: idInput,
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
    // A doubles team shares one Warlord, so losing a member clears the partner's list; a 2v1 ally's list stands alone.
    const sharedTeam = event.format === '2v2'
    const resealIds =
      input.status === 'rejected' && entry.teamId && sharedTeam
        ? entries
            .filter((row) => row.userId !== entry.userId && row.teamId === entry.teamId && row.rosterSnapshot !== undefined)
            .map((row) => row.userId)
        : []
    if (input.status === 'rejected' && entry.teamId) {
      clearTeamPicks(tx, event.id, new Set([entry.teamId]))
      for (const teammate of entries.filter((row) => row.teamId === entry.teamId))
        tx.db.leagueEventEntries.key.update({
          ...teammate,
          teamId: undefined,
          ...(sharedTeam
            ? { requiredLimit: undefined, rosterId: undefined, rosterName: undefined, rosterSnapshot: undefined, submittedAt: undefined }
            : {}),
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
        userId: idInput,
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
      // A new size takes the entrant out of any allied pair; the partner stays allied and waits for another.
      if (entry.teamId) {
        for (const teammate of leagueEntriesFor(tx, event.id).filter((row) => row.teamId === entry.teamId && row.userId !== entry.userId))
          tx.db.leagueEventEntries.key.update({ ...teammate, teamId: undefined })
        clearTeamPicks(tx, event.id, new Set([entry.teamId]))
      }
      tx.db.leagueEventEntries.key.update({
        ...entry,
        requiredLimit: input.requiredLimit,
        teamId: undefined,
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
        userIds: z.array(idInput).min(1).max(2),
        teamId: idInput,
        noticeResults: z.boolean().optional(),
      }),
      value,
    )
    if (event.revealedAt !== undefined) return productJson('closed')
    if ((event.format !== '2v2' && event.format !== '2v1') || event.rosterLimit === undefined) return productJson('wrong-format')
    const userIds = [...new Set(input.userIds)]
    const entries = leagueEntriesFor(tx, event.id)
    const targets = entries.filter((entry) => userIds.includes(entry.userId) && entry.status === 'accepted')
    if (targets.length !== userIds.length) return productJson('missing')
    const previousTeamId = targets[0]?.teamId
    if (userIds.length === 2 && previousTeamId && targets.every((entry) => entry.teamId === previousTeamId))
      return productJson(input.noticeResults ? { resealIds: [] } : 'updated')
    const oldTeams = new Set(targets.map((entry) => entry.teamId).filter((id) => id !== undefined))
    const affected = entries.filter((entry) => userIds.includes(entry.userId) || (entry.teamId && oldTeams.has(entry.teamId)))
    clearTeamPicks(tx, event.id, oldTeams)
    if (event.format === '2v1') {
      // Each allied list stands on its own, so pairing keeps it unless the entrant was solo and needs a smaller one.
      const allied = alliedLeagueRosterLimit(event.rosterLimit)
      const paired = userIds.length === 2 ? userIds : []
      const resized = affected.filter((entry) => paired.includes(entry.userId) && entry.requiredLimit !== allied)
      for (const entry of affected) {
        const resize = resized.includes(entry)
        tx.db.leagueEventEntries.key.update({
          ...entry,
          teamId: paired.includes(entry.userId) ? input.teamId : undefined,
          ...(resize
            ? { requiredLimit: allied, rosterId: undefined, rosterName: undefined, rosterSnapshot: undefined, submittedAt: undefined }
            : {}),
        })
      }
      touchLeague(tx, league.id, event.id)
      const resealIds = resized.filter((entry) => entry.rosterSnapshot !== undefined).map((entry) => entry.userId)
      return productJson(input.noticeResults ? { resealIds } : 'updated')
    }
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
        userId: idInput,
        rosterId: idInput,
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
    // The deadline closes sealing until the reveal; a list the organizer unseals afterwards can still be replaced.
    if (event.revealedAt === undefined && event.sealBy !== undefined && BigInt(input.now) > event.sealBy)
      return productJson({ outcome: 'past-deadline' })
    const requiredLimit = requiredLeagueRosterLimit(
      (event.format ?? null) as TableShape | null,
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
    const allowances = leagueEventAllowances(event)
    if (!leagueWarlordWaived(submitted, allowances) && !leagueWarlordValid(submitted))
      return productJson({ outcome: 'invalid-warlords', format: event.format ?? null })
    const refusal = leagueAllowanceRefusal(submitted, allowances)
    if (refusal) return productJson({ outcome: 'disallowed', message: refusal })
    if (event.pointsBudget !== undefined && (submitted.built?.pointsBudget ?? submitted.built?.limit) !== event.pointsBudget)
      return productJson({ outcome: 'wrong-budget', pointsBudget: event.pointsBudget })
    if (
      event.format === '2v2' &&
      !leagueEntriesFor(tx, event.id).some((row) => row.userId !== input.userId && row.teamId === entry.teamId && row.status === 'accepted')
    )
      return productJson({ outcome: 'unassigned' })
    // After reveal the pair's card is fixed, so a replacement list must leave it one the pair still offers.
    const pick =
      event.revealedAt !== undefined && entry.teamId ? tx.db.leagueEventTeams.key.find(JSON.stringify([event.id, entry.teamId])) : undefined
    if (pick) {
      const teammate = leagueEntriesFor(tx, event.id).find(
        (row) => row.userId !== input.userId && row.teamId === entry.teamId && row.status === 'accepted',
      )
      const partner = teammate ? sealedRoster(teammate) : null
      if (partner && !teamDispositionChoices([submitted, partner]).includes(pick.disposition))
        return productJson({ outcome: 'disposition-dropped', disposition: pick.disposition })
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
  if (operation === 'set-team-disposition') {
    const input = leagueCommandInput(
      z.object({ op: z.literal('set-team-disposition'), disposition: z.string().min(1).max(64), now: leagueTimeInput }),
      value,
    )
    if (event.revealedAt !== undefined) return productJson({ outcome: 'closed' })
    const entry = tx.db.leagueEventEntries.key.find(JSON.stringify([event.id, ownerId]))
    if (!entry || entry.status !== 'accepted' || !entry.teamId) return productJson({ outcome: 'missing' })
    const entries = leagueEntriesFor(tx, event.id)
    const team = eventTeams(tx, event.id, entries).find((candidate) => candidate.id === entry.teamId)
    if (!team?.choices.includes(input.disposition)) return productJson({ outcome: 'not-offered' })
    setTeamPick(tx, event.id, team.id, input.disposition)
    touchLeague(tx, league.id, event.id)
    return productJson({ outcome: 'chosen' })
  }
  if (operation === 'set-team-warlord') {
    const input = leagueCommandInput(z.object({ op: z.literal('set-team-warlord'), userId: idInput, now: leagueTimeInput }), value)
    if (event.revealedAt !== undefined) return productJson({ outcome: 'closed' })
    const entry = tx.db.leagueEventEntries.key.find(JSON.stringify([event.id, ownerId]))
    if (!entry || entry.status !== 'accepted' || !entry.teamId) return productJson({ outcome: 'missing' })
    const entries = leagueEntriesFor(tx, event.id)
    const team = eventTeams(tx, event.id, entries).find((candidate) => candidate.id === entry.teamId)
    if (!team?.warlordChoices.includes(input.userId)) return productJson({ outcome: 'not-offered' })
    setTeamWarlord(tx, event.id, team.id, input.userId)
    touchLeague(tx, league.id, event.id)
    return productJson({ outcome: 'chosen' })
  }
  if (operation === 'reveal') {
    const input = leagueCommandInput(z.object({ op: z.literal('reveal'), now: leagueTimeInput }), value)
    if (event.revealedAt !== undefined) return productJson({ outcome: 'not-ready' })
    const actor = tx.db.leagueEventEntries.key.find(JSON.stringify([event.id, ownerId]))
    if (!mayRevealLeague(organizer, actor ? { status: actor.status as LeagueEntryStatus } : null))
      return productJson({ outcome: 'not-ready' })
    const revealed = revealLeagueEvent(tx, event, input.now, ownerId)
    if (revealed.outcome === 'revealed') touchLeague(tx, league.id, event.id)
    return productJson(revealed)
  }
  if (operation === 'unseal') {
    const input = leagueCommandInput(z.object({ op: z.literal('unseal'), userId: idInput }), value)
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
        id: idInput,
        battleToken: idInput,
        userId: idInput,
        allyIds: z.array(idInput).max(3),
        opponentIds: z.array(idInput).min(1).max(3),
        initialCommands: z.array(commandSchema).max(1_000),
        now: leagueTimeInput,
        expectedLatest: z.boolean(),
        expectedEntries: z.array(z.object({ userId: idInput, snapshot: z.string().max(1_000_000) })).max(128),
        pairingKey: z
          .string()
          .max(MAX_ID_LENGTH * 2)
          .optional(),
      }),
      value,
    )
    if (event.revealedAt === undefined) return productJson(false)
    // A Swiss tournament plays only the tables its organizer paired, each once.
    const pairing = input.pairingKey ? tx.db.leagueRoundPairings.key.find(input.pairingKey) : undefined
    if (event.rounds !== undefined) {
      const latest = Math.max(0, ...roundPairings(tx, event.id).map((row) => row.round))
      const players = new Set([pairing?.aId, pairing?.bId])
      if (
        !pairing ||
        pairing.eventId !== event.id ||
        pairing.round !== latest ||
        pairing.battleId !== undefined ||
        !players.has(input.userId) ||
        !players.has(input.opponentIds[0]) ||
        input.opponentIds.length !== 1 ||
        input.allyIds.length
      )
        return productJson(false)
    }
    if (input.expectedLatest && leagueEventFor(tx, league.id, null)?.id !== event.id) return productJson(false)
    const seatIds = [input.userId, ...input.allyIds, ...input.opponentIds]
    if (seatIds.length > 4 || new Set(seatIds).size !== seatIds.length) return productJson(false)
    const entries = leagueEntriesFor(tx, event.id).filter(
      (entry) =>
        entry.status === 'accepted' &&
        entry.rosterSnapshot !== undefined &&
        (event.format === '2v2' || event.format === '2v1' || seatIds.includes(entry.userId)),
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
        guestName: undefined,
        claimedSeat: undefined,
      })
    const log: LoggedCommand[] = []
    for (const [index, command] of input.initialCommands.entries()) {
      const state = reduceBattle(
        seats.map((seat) => seat.id),
        log,
        seats.map((seat) => seat.side),
      )
      const refusal = command.kind === 'set-battle-club' ? 'a club is chosen during setup' : validate(state, input.userId, command)
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
    if (pairing && event.rounds !== undefined) tx.db.leagueRoundPairings.key.update({ ...pairing, battleId: input.id })
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
  update_onboarding: updateOnboardingIn,
  add_to_collection: addToCollectionIn,
  remove_from_collection: removeFromCollectionIn,
  set_collection_models: setCollectionModelsIn,
  set_collection_progress: setCollectionProgressIn,
  set_collection_counts_as: setCollectionCountsAsIn,
  set_collection_wanted: setCollectionWantedIn,
  add_favourite_faction: addFavouriteFactionIn,
  remove_favourite_faction: removeFavouriteFactionIn,
  add_favourite_detachment: addFavouriteDetachmentIn,
  remove_favourite_detachment: removeFavouriteDetachmentIn,
  add_favourite_datasheet: addFavouriteDatasheetIn,
  remove_favourite_datasheet: removeFavouriteDatasheetIn,
  remember_matchup: rememberMatchupIn,
  forget_matchup: forgetMatchupIn,
  save_ability_reminder: saveAbilityReminderIn,
  delete_ability_reminder: deleteAbilityReminderIn,
  set_push_enabled: setPushEnabledIn,
  set_player_defaults: setPlayerDefaultsIn,
  league_command: leagueCommandIn,
}

const syncProductInput = z.object({
  id: z.uuid(),
  owner: idInput,
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.number().int().nonnegative(),
  name: z.string(),
  args: z.array(z.unknown()).max(8),
  reportApplied: z.boolean().optional(),
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
    const input = decodePayload(syncProductInput, payload, 'Invalid saved action')
    const prior = tx.db.syncReceipts.id.find(input.id)
    if (prior) {
      if (prior.owner !== input.owner || prior.fingerprint !== input.fingerprint) throw new SenderError('Operation ID reused')
      return input.reportApplied ? productJson({ result: prior.result, applied: false }) : prior.result
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
    const decoded: unknown = typeof result === 'string' ? JSON.parse(result) : result
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
    const encoded = productJson(result ?? null)
    return input.reportApplied ? productJson({ result: encoded, applied: !refusal }) : encoded
  }),
)
