import { ScheduleAt } from 'spacetimedb'
import { SenderError, schema, table, t, type InferSchema, type ProcedureCtx, type ReducerCtx, type ViewCtx } from 'spacetimedb/server'
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
  pointsBudgetOf,
  pointsSpent,
  withinArmyPoints,
  importedCommandRefusal,
  applyEntry,
  reduceBattle,
  validate,
  type FormatRuleId,
  type BattleState,
  type Command,
  type LoggedCommand,
} from '../../src/core/battle'
import { teamDispositionChoices } from '../../src/core/teamDisposition'
import { DEFAULT_PLAYER_DEFAULTS, isPlayerDefaults } from '../../src/core/playerDefaults'
import { matchupPairingSchema, RECENT_MATCHUP_LIMIT, recentMatchupSchema } from '../../src/core/recentMatchups'
import { onboardingTaskIds, tourTaskIds } from '../../src/core/onboarding'
import {
  alliedLeagueRosterLimit,
  leagueAllowancesSchema,
  leagueArmyPointsError,
  leagueEntryPoints,
  leagueSeatRefusal,
  leagueSharesPoints,
  parseLeagueAllowances,
  leagueAllowanceRefusal,
  leaguePlacesSeat,
  leagueWarlordValid,
  leagueWarlordWaived,
  leagueRegistrationFull,
  leagueRevealChecklist,
  leagueTitle,
  leagueSealingClosed,
  leagueTeams,
  leagueReminderRecipients,
  mayRemindLeague,
  mayRevealLeague,
  LEAGUE_ADMIN_MAX,
  LEAGUE_ADMISSIONS,
  LEAGUE_MEMBER_MAX,
  LEAGUE_MEMBER_MIN,
  LEAGUE_VISIBILITIES,
  type LeagueAdmission,
  type LeagueEntryStatus,
  matchesSealedLeagueRoster,
  requiredLeagueRosterLimit,
} from '../../src/core/league'
import { commandSchema, parseRosterSnapshot, rosterPickSchema, rosterSnapshotOrNull } from '../../src/core/commands'
import { SWISS_ROUNDS_MAX, swissResultLocked } from '../../src/core/swiss'
import { compareStandings } from '../../src/core/standings'
import type { SyncProductActionName } from '../../src/core/syncProductActions'
import {
  clubGameOpen,
  clubGamePastAt,
  clubGameTimeZoneSchema,
  CLUB_ADMIN_MAX,
  CLUB_DESCRIPTION_MAX_LENGTH,
  CLUB_GAME_SIDES,
  CLUB_MEMBER_MAX,
  CLUB_NAME_MAX_LENGTH,
  isClubOrganizer,
  type ClubMemberStatus,
  type ClubRole,
} from '../../src/core/club'
import { CLUB_SEASON_PLAYERS_MAX, CLUB_SEASON_PLAYERS_MIN, CLUB_SEASON_SEED_MAX, seasonDraw } from '../../src/core/clubSeason'
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
import { externalPlayerKey, IMPORT_SOURCES } from '../../src/core/importSources'
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
  return idInput.safeParse(value).success
}

/** The last row of the page before, newest first. */
const pageCursorInput = z.strictObject({ at: z.number().int().nonnegative(), id: z.string().max(MAX_ID_LENGTH) }).nullable()

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

function operatorTx<T>(ctx: ProcedureCtx<InferSchema<typeof spacetime>>, run: (tx: Context) => T) {
  return ctx.withTx((tx) => {
    requireOperator(tx)
    return run(tx)
  })
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
  | 'achievements'

/** Scopes whose writes can change a player's medals. Battles move them through their stored results instead. */
const ACHIEVEMENT_SCOPES = new Set<ProductScope>([
  'rosters',
  'collection',
  'favourites',
  'friends',
  'settings',
  'leagues',
  'clubs',
  'simulator',
])

function touchProduct(ctx: Context, userId: string, ...scopes: ProductScope[]) {
  // Nobody signs in as a guest, so nobody would ever read its revisions or delete them with an account.
  if (isGuestSeat(userId)) return
  for (const scope of scopes) {
    const key = JSON.stringify([userId, scope])
    const current = ctx.db.productRevisions.key.find(key)
    if (current) ctx.db.productRevisions.key.update({ ...current, revision: current.revision + 1n })
    else ctx.db.productRevisions.insert({ key, userId, scope, revision: 1n })
  }
  if (scopes.some((scope) => ACHIEVEMENT_SCOPES.has(scope))) recheckAchievements(ctx, userId)
}

type PublicScope = 'collection' | 'battles' | 'rosters' | 'leagues' | 'clubs' | 'invites' | 'standings' | 'opponents'

type ScopeRevision = { scope: string; revision: bigint }

function bumpRevision(
  revisions: {
    scope: { find(scope: string): ScopeRevision | null; update(row: ScopeRevision): unknown }
    insert(row: ScopeRevision): unknown
  },
  scope: string,
) {
  const current = revisions.scope.find(scope)
  if (current) revisions.scope.update({ ...current, revision: current.revision + 1n })
  else revisions.insert({ scope, revision: 1n })
}

function touchPublic(ctx: Context, scope: PublicScope) {
  bumpRevision(ctx.db.publicRevisions, scope)
}

/** A battle's log or seats changed: its feeds refetch, and `battleChanges` hands it to the leaderboard again. */
function touchBattle(ctx: Context, battleId: string) {
  touchPublic(ctx, 'battles')
  const revision = ctx.db.publicRevisions.scope.find('battles')!.revision
  ctx.db.battleChanges.battleId.delete(battleId)
  ctx.db.battleChanges.insert({ battleId, revision })
  ctx.db.battleActivity.battleId.delete(battleId)
}

/** When a battle last had a command, read from its log only the first time after the log changed. */
function lastActivity(ctx: Context, battle: { id: string; createdAt: bigint }) {
  const stored = ctx.db.battleActivity.battleId.find(battle.id)
  if (stored) return stored.at
  let at = battle.createdAt
  for (const command of ctx.db.commands.battleId.filter(battle.id)) if (command.at > at) at = command.at
  ctx.db.battleActivity.insert({ battleId: battle.id, at })
  return at
}

function touchAdmin(ctx: Context) {
  bumpRevision(ctx.db.adminRevisions, 'admin-users')
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

type SealedEventRow = NonNullable<ReturnType<Context['db']['sealedEvents']['id']['find']>>
type TournamentRow = NonNullable<ReturnType<Context['db']['tournaments']['id']['find']>>
type ClubGameRow = NonNullable<ReturnType<Context['db']['clubGames']['eventId']['find']>>
type ClubRow = NonNullable<ReturnType<Context['db']['clubs']['id']['find']>>

/** Who runs a sealed event and on what terms: a tournament, or the club whose game it is. */
type EventHost =
  | { kind: 'tournament'; tournament: TournamentRow; event: SealedEventRow }
  | { kind: 'club'; game: ClubGameRow; club: ClubRow; event: SealedEventRow }

function hostOfEvent(ctx: Context, event: SealedEventRow): EventHost | undefined {
  const tournament = ctx.db.tournaments.eventId.find(event.id)
  if (tournament) return { kind: 'tournament', tournament, event }
  const game = ctx.db.clubGames.eventId.find(event.id)
  const club = game && ctx.db.clubs.id.find(game.clubId)
  return game && club ? { kind: 'club', game, club, event } : undefined
}

/** The event a tournament's token or an event's own token names; a club game's address is its event's token. */
function eventHost(ctx: Context, token: string) {
  const tournament = ctx.db.tournaments.token.find(token)
  const event = tournament ? ctx.db.sealedEvents.id.find(tournament.eventId) : ctx.db.sealedEvents.token.find(token)
  return event && hostOfEvent(ctx, event)
}

/**
 * The event a command or read names. One queued before each event had its own host may name its old league, now its
 * club, beside the event's own token.
 */
function namedHost(ctx: Context, token: string, eventToken: string) {
  if (!eventToken) return eventHost(ctx, token)
  const event = ctx.db.sealedEvents.token.find(eventToken)
  const host = event && hostOfEvent(ctx, event)
  return host && [hostToken(host), host.event.token, host.kind === 'club' ? host.club.token : null].includes(token) ? host : undefined
}

/** The address an event's page and its battles' logs name it by. */
const hostToken = (host: EventHost) => (host.kind === 'tournament' ? host.tournament.token : host.event.token)

function tournamentAdminIds(ctx: Context, tournamentId: string) {
  return Array.from(ctx.db.tournamentAdmins.tournamentId.filter(tournamentId), (row) => row.userId)
}

/** Everyone who runs an event: a tournament's owner and admins, or the organizers of the club whose game it is. */
function hostOrganizerIds(ctx: Context, host: EventHost) {
  if (host.kind === 'tournament') return [host.tournament.ownerId, ...tournamentAdminIds(ctx, host.tournament.id)]
  const members = clubMemberRows(ctx, host.club)
  return members.filter((member) => isClubOrganizer(host.club, members, member.userId)).map((member) => member.userId)
}

/** A tournament's own entry rules; a club game lets its club's members in outright, with no limit beyond the club's. */
function hostEntryRules(host: EventHost) {
  return host.kind === 'tournament'
    ? { admission: host.tournament.admission as LeagueAdmission, playerLimit: host.tournament.playerLimit ?? null }
    : { admission: 'automatic' as const, playerLimit: null }
}

/** What an event is called wherever it is named on its own, as `leagueTitle` reads it. */
function eventTitle(host: EventHost) {
  return leagueTitle({
    tournament: host.kind === 'tournament' ? host.tournament : null,
    club: host.kind === 'club' ? host.club : null,
    format: (host.event.format ?? null) as TableShape | null,
    rosterLimit: host.event.rosterLimit ?? null,
    pointsBudget: host.event.pointsBudget,
    soloPoints: host.event.soloPoints ?? null,
    allyPoints: host.event.allyPoints ?? null,
    sharedPoints: host.event.sharedPoints ?? false,
  })
}

function touchEvent(ctx: Context, host: EventHost) {
  const users = new Set(hostOrganizerIds(ctx, host))
  for (const entry of ctx.db.leagueEventEntries.eventId.filter(host.event.id)) users.add(entry.userId)
  for (const userId of users) touchProduct(ctx, userId, 'leagues', 'onboarding')
  touchPublic(ctx, 'leagues')
  if (host.kind === 'club') touchClub(ctx, host.club.id)
}

function touchEventById(ctx: Context, eventId: string) {
  const event = ctx.db.sealedEvents.id.find(eventId)
  const host = event && hostOfEvent(ctx, event)
  if (host) touchEvent(ctx, host)
}

function deleteBattle(ctx: Context, battleId: string) {
  const seats = Array.from(ctx.db.battleUsers.battleId.filter(battleId))
  const leagueEvent = ctx.db.leagueEventBattles.battleId.find(battleId)
  for (const seat of seats) touchProduct(ctx, seat.userId, 'battles', 'onboarding')
  touchBattle(ctx, battleId)
  touchPublic(ctx, 'standings')
  touchAdmin(ctx)
  if (leagueEvent) touchEventById(ctx, leagueEvent.eventId)
  for (const row of Array.from(ctx.db.watchedBattles.battleId.filter(battleId))) ctx.db.watchedBattles.key.delete(row.key)
  for (const row of Array.from(ctx.db.commands.battleId.filter(battleId))) ctx.db.commands.key.delete(row.key)
  for (const seat of seats) ctx.db.battleUsers.key.delete(seat.key)
  for (const row of Array.from(ctx.db.guestSeats.battleId.filter(battleId))) ctx.db.guestSeats.seatId.delete(row.seatId)
  // A deleted table battle frees its pairing, so the two players can start it again.
  if (leagueEvent)
    for (const pairing of Array.from(ctx.db.leagueRoundPairings.eventId.filter(leagueEvent.eventId)))
      if (pairing.battleId === battleId) ctx.db.leagueRoundPairings.key.update({ ...pairing, battleId: undefined })
  ctx.db.leagueEventBattles.battleId.delete(battleId)
  ctx.db.clubBattles.battleId.delete(battleId)
  ctx.db.battleImports.battleId.delete(battleId)
  for (const row of Array.from(ctx.db.importedSeats.battleId.filter(battleId))) ctx.db.importedSeats.key.delete(row.key)
  ctx.db.battles.id.delete(battleId)
}

/** Removes an event and its host with everything sealed, chosen and paired in it; its battles stay. */
function deleteHost(ctx: Context, host: EventHost) {
  touchEvent(ctx, host)
  const eventId = host.event.id
  for (const row of Array.from(ctx.db.leagueRosterSharing.eventId.filter(eventId))) ctx.db.leagueRosterSharing.key.delete(row.key)
  for (const row of Array.from(ctx.db.leagueEventEntries.eventId.filter(eventId))) ctx.db.leagueEventEntries.key.delete(row.key)
  clearTeamPicks(ctx, eventId)
  for (const row of Array.from(ctx.db.leagueEventBattles.eventId.filter(eventId))) ctx.db.leagueEventBattles.battleId.delete(row.battleId)
  for (const row of Array.from(ctx.db.leagueRoundPairings.eventId.filter(eventId))) ctx.db.leagueRoundPairings.key.delete(row.key)
  ctx.db.sealedEvents.id.delete(eventId)
  if (host.kind === 'club') {
    ctx.db.clubGames.eventId.delete(eventId)
    return
  }
  for (const row of Array.from(ctx.db.tournamentAdmins.tournamentId.filter(host.tournament.id))) ctx.db.tournamentAdmins.key.delete(row.key)
  ctx.db.tournaments.id.delete(host.tournament.id)
}

function touchClub(ctx: Context, clubId: string) {
  const club = ctx.db.clubs.id.find(clubId)
  if (!club) return
  touchProduct(ctx, club.ownerId, 'clubs')
  for (const member of ctx.db.clubMembers.clubId.filter(clubId)) touchProduct(ctx, member.userId, 'clubs')
  touchPublic(ctx, 'clubs')
}

const CLUB_MEMBERS_ONLY = 'every player must be a member of the club'
const SWISS_RESULT_LOCKED = 'a later round is paired on this result, so only the organizer can reopen it'

/** A Swiss table's round, the latest round paired in its event, and who runs that event, or null for any other battle. */
function swissTable(ctx: Context, battleId: string) {
  const link = ctx.db.leagueEventBattles.battleId.find(battleId)
  if (!link) return null
  const pairings = Array.from(ctx.db.leagueRoundPairings.eventId.filter(link.eventId))
  const paired = pairings.find((pairing) => pairing.battleId === battleId)
  if (!paired) return null
  const event = ctx.db.sealedEvents.id.find(link.eventId)
  const host = event && hostOfEvent(ctx, event)
  return {
    battleRound: paired.round,
    latestPairedRound: Math.max(...pairings.map((pairing) => pairing.round)),
    organizerIds: host ? hostOrganizerIds(ctx, host) : [],
  }
}

function isClubMember(ctx: Context, clubId: string, userId: string) {
  return ctx.db.clubMembers.key.find(JSON.stringify([clubId, userId]))?.status === 'accepted'
}

/** A club's games, newest first. */
function clubGameHosts(ctx: Context, club: ClubRow) {
  return Array.from(ctx.db.clubGames.clubId.filter(club.id))
    .flatMap((game) => {
      const event = ctx.db.sealedEvents.id.find(game.eventId)
      return event ? [{ kind: 'club' as const, game, club, event }] : []
    })
    .sort(
      (a, b) =>
        Number(b.game.createdAt - a.game.createdAt) ||
        Number(a.game.supersededAt !== undefined) - Number(b.game.supersededAt !== undefined),
    )
}

function gamePastAt({ game, event }: Extract<EventHost, { kind: 'club' }>) {
  return clubGamePastAt({
    playsAt: event.playsAt === undefined ? null : Number(event.playsAt),
    revealedAt: event.revealedAt === undefined ? null : Number(event.revealedAt),
    supersededAt: game.supersededAt === undefined ? null : Number(game.supersededAt),
    timeZone: game.timeZone ?? 'UTC',
  })
}

function pastClubGame(ctx: Context, host: EventHost) {
  return host.kind === 'club' && !clubGameOpen({ pastAt: gamePastAt(host) }, safeNumber(nowMs(ctx)))
}

/** How many battles a club has and when the latest began, for its card. */
function clubActivity(ctx: Context, clubId: string) {
  const ids = new Set(clubBattleIds(ctx, clubId))
  let lastBattleAt: bigint | null = null
  for (const id of ids) {
    const createdAt = ctx.db.battles.id.find(id)?.createdAt
    if (createdAt !== undefined && (lastBattleAt === null || createdAt > lastBattleAt)) lastBattleAt = createdAt
  }
  return { battleCount: ids.size, lastBattleAt }
}

/** Battles that count for a club: those tagged for it, and those its games started. */
function* clubBattleIds(ctx: Context, clubId: string) {
  for (const row of ctx.db.clubBattles.clubId.filter(clubId)) yield row.battleId
  for (const game of ctx.db.clubGames.clubId.filter(clubId))
    for (const row of ctx.db.leagueEventBattles.eventId.filter(game.eventId)) yield row.battleId
}

/** Whether `clubBattleIds` yields this battle for any club. */
function isClubBattle(ctx: Context, battleId: string) {
  const game = ctx.db.leagueEventBattles.battleId.find(battleId)
  return Boolean(ctx.db.clubBattles.battleId.find(battleId) ?? (game && ctx.db.clubGames.eventId.find(game.eventId)))
}

/** Clubs every seat belongs to, none of them a guest or practice opponent: the clubs this battle may count for. */
function battleClubIds(ctx: Context, seats: readonly { id: string; automated: boolean }[]) {
  if (seats.some((seat) => seat.automated || isGuestSeat(seat.id))) return []
  const [first, ...rest] = seats
  if (!first) return []
  return Array.from(ctx.db.clubMembers.userId.filter(first.id))
    .filter((row) => row.status === 'accepted')
    .map((row) => row.clubId)
    .filter((clubId) => rest.every((seat) => isClubMember(ctx, clubId, seat.id)))
}

/** Rewrites a battle's club index row from its log, so a choice and its undo both land in the index. */
function indexClubBattle(ctx: Context, battleId: string) {
  const { clubId } = battleState(ctx, battleId).state
  ctx.db.clubBattles.battleId.delete(battleId)
  if (clubId) ctx.db.clubBattles.insert({ battleId, clubId })
}

/** A club takes its games with it; their battles stay. */
function deleteClub(ctx: Context, club: ClubRow) {
  for (const host of clubGameHosts(ctx, club)) deleteHost(ctx, host)
  const season = ctx.db.clubSeasons.clubId.find(club.id)
  if (season) deleteSeason(ctx, season)
  touchClub(ctx, club.id)
  for (const row of Array.from(ctx.db.clubMembers.clubId.filter(club.id))) ctx.db.clubMembers.key.delete(row.key)
  for (const row of Array.from(ctx.db.clubBattles.clubId.filter(club.id))) ctx.db.clubBattles.battleId.delete(row.battleId)
  ctx.db.clubs.id.delete(club.id)
}

type SeasonRow = NonNullable<ReturnType<Context['db']['clubSeasons']['id']['find']>>

const seasonPlayerKey = (seasonId: string, userId: string) => JSON.stringify([seasonId, userId])

const byJoined = (a: { joinedAt: bigint; userId: string }, b: { joinedAt: bigint; userId: string }) =>
  a.joinedAt < b.joinedAt ? -1 : a.joinedAt > b.joinedAt ? 1 : a.userId.localeCompare(b.userId)

function seasonPlayers(ctx: Context, seasonId: string) {
  return Array.from(ctx.db.clubSeasonPlayers.seasonId.filter(seasonId)).sort(byJoined)
}

/** A season takes its players and fixtures with it; its battles stay. */
function deleteSeason(ctx: Context, season: SeasonRow) {
  for (const row of Array.from(ctx.db.clubSeasonPlayers.seasonId.filter(season.id))) ctx.db.clubSeasonPlayers.key.delete(row.key)
  for (const row of Array.from(ctx.db.leagueEventBattles.eventId.filter(season.id))) ctx.db.leagueEventBattles.battleId.delete(row.battleId)
  for (const row of Array.from(ctx.db.leagueRoundPairings.eventId.filter(season.id))) ctx.db.leagueRoundPairings.key.delete(row.key)
  ctx.db.clubSeasons.id.delete(season.id)
}

/**
 * Takes a player out of their club's season: out of a draft altogether, or withdrawn from a published one, whose
 * unfinished fixtures become void. A battle still being played leaves its fixture and counts for the club alone.
 */
function leaveSeason(ctx: Context, clubId: string, userId: string) {
  const season = ctx.db.clubSeasons.clubId.find(clubId)
  const row = season && ctx.db.clubSeasonPlayers.key.find(seasonPlayerKey(season.id, userId))
  if (!season || !row || row.withdrawn) return false
  if (season.publishedAt === undefined) {
    ctx.db.clubSeasonPlayers.key.delete(row.key)
    return true
  }
  ctx.db.clubSeasonPlayers.key.update({ ...row, withdrawn: true })
  for (const fixture of roundPairings(ctx, season.id))
    if ((fixture.aId === userId || fixture.bId === userId) && fixture.battleId !== undefined && !pairingFinished(ctx, fixture)) {
      ctx.db.leagueEventBattles.battleId.delete(fixture.battleId)
      ctx.db.leagueRoundPairings.key.update({ ...fixture, battleId: undefined })
    }
  return true
}

const NOT_A_FIXTURE = 'this battle is not an open fixture of the season'

/** The open fixture a new battle plays: its two players only, both still in the season, counted for its club. */
function openFixture(
  ctx: Context,
  key: string,
  battle: Pick<z.infer<typeof newBattle>, 'userId' | 'allyIds' | 'opponentIds' | 'guestNames' | 'initialCommands'>,
) {
  const fixture = ctx.db.leagueRoundPairings.key.find(key)
  const season = fixture && ctx.db.clubSeasons.id.find(fixture.eventId)
  if (!fixture || !season || season.publishedAt === undefined || fixture.bId === undefined || fixture.battleId !== undefined)
    throw new SenderError(NOT_A_FIXTURE)
  const playing = (userId: string) => ctx.db.clubSeasonPlayers.key.find(seasonPlayerKey(season.id, userId))?.withdrawn === false
  const players = new Set([fixture.aId, fixture.bId])
  if (
    battle.allyIds.length ||
    battle.guestNames.length ||
    battle.opponentIds.length !== 1 ||
    !players.has(battle.userId) ||
    !players.has(battle.opponentIds[0]!) ||
    !playing(fixture.aId) ||
    !playing(fixture.bId) ||
    !battle.initialCommands.some((command) => command.kind === 'set-battle-club' && command.clubId === season.clubId)
  )
    throw new SenderError(NOT_A_FIXTURE)
  return { fixture, season }
}

const seasonDeadlines = (season: SeasonRow) => (season.deadlines === undefined ? [] : (JSON.parse(season.deadlines) as (number | null)[]))

/** A club's season as every reader sees it; a draft's fixtures are drawn from its seed by whoever reads it. */
function seasonRecord(ctx: Context, clubId: string) {
  const season = ctx.db.clubSeasons.clubId.find(clubId)
  if (!season) return null
  return {
    seed: season.seed,
    createdAt: season.createdAt,
    publishedAt: season.publishedAt ?? null,
    deadlines: seasonDeadlines(season),
    players: seasonPlayers(ctx, season.id).map((row) => ({ userId: row.userId, withdrawn: row.withdrawn })),
    fixtures: roundPairings(ctx, season.id).map((pairing) => pairingView(ctx, pairing)),
  }
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
        guestSessionCurrent(safeNumber(device.joinedAt), safeNumber(nowMs(ctx)))
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
  for (const row of Array.from(ctx.db.tournaments.ownerId.filter(userId))) {
    const host = eventHost(ctx, row.token)
    if (host) deleteHost(ctx, host)
  }
  for (const row of Array.from(ctx.db.clubs.ownerId.filter(userId))) deleteClub(ctx, row)
  for (const row of Array.from(ctx.db.clubMembers.userId.filter(userId))) {
    ctx.db.clubMembers.key.delete(row.key)
    touchClub(ctx, row.clubId)
  }
  for (const row of Array.from(ctx.db.clubSeasonPlayers.userId.filter(userId))) ctx.db.clubSeasonPlayers.key.delete(row.key)
  for (const row of Array.from(ctx.db.tournamentAdmins.userId.filter(userId))) {
    const tournament = ctx.db.tournaments.id.find(row.tournamentId)
    if (tournament) touchEventById(ctx, tournament.eventId)
    ctx.db.tournamentAdmins.key.delete(row.key)
  }
  for (const row of Array.from(ctx.db.userOnboardingTasks.userId.filter(userId))) ctx.db.userOnboardingTasks.key.delete(row.key)
  for (const row of Array.from(ctx.db.externalAccounts.userId.filter(userId))) ctx.db.externalAccounts.key.delete(row.key)
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
  for (const row of Array.from(ctx.db.commands.userId.filter(userId))) {
    ctx.db.commands.key.delete(row.key)
    touchBattle(ctx, row.battleId)
    touchPublic(ctx, 'standings')
  }
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
  for (const eventId of affectedEvents) touchEventById(ctx, eventId)
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
    practiceChanged(ctx, userId)
    touchPublic(ctx, 'opponents')
    touchAdmin(ctx)
  }
  for (const row of Array.from(ctx.db.syncReceipts.owner.filter(userId))) ctx.db.syncReceipts.id.delete(row.id)
  for (const row of Array.from(ctx.db.rosterSync.userId.filter(userId))) ctx.db.rosterSync.id.delete(row.id)
  for (const row of Array.from(ctx.db.productRevisions.userId.filter(userId))) ctx.db.productRevisions.key.delete(row.key)
  for (const row of Array.from(ctx.db.earnedAchievements.userId.filter(userId))) ctx.db.earnedAchievements.key.delete(row.key)
  ctx.db.achievementChecks.userId.delete(userId)
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

/** The reader's session unless revoked; its expiry timer removes it once it lapses. */
function viewerSession(ctx: ViewCtx<InferSchema<typeof spacetime>>) {
  const session = ctx.db.sessionAccess.identity.filter(ctx.sender).next().value
  return session && !ctx.db.revokedSession.subject.find(session.subject) ? session : undefined
}

export const mySession = spacetime.view({ name: 'my_session', public: true }, t.option(sessionAccess.rowType), (ctx) => {
  return viewerSession(ctx)
})

export const myProductSignals = spacetime.view(
  { name: 'my_product_signals', public: true },
  t.array(t.row('MyProductSignal', { scope: t.string().primaryKey(), revision: t.u64() })),
  (ctx) => {
    const session = viewerSession(ctx)
    if (!session) return []
    return Array.from(ctx.db.productRevisions.userId.filter(session.userId), ({ scope, revision }) => ({ scope, revision }))
  },
)

export const myAdminSignals = spacetime.view(
  { name: 'my_admin_signals', public: true },
  t.array(t.row('MyAdminSignal', { scope: t.string().primaryKey(), revision: t.u64() })),
  (ctx) => {
    const session = viewerSession(ctx)
    if (!session || !ctx.db.adminSessions.subject.find(session.subject)) return []
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
    const session = viewerSession(ctx)
    if (!session) return []
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
    const session = viewerSession(ctx)
    if (!session) return []
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

/** What an offline command carries so its retry lands once; the stored body keeps it under `$sync`. */
const battleSyncSchema = z.object({
  operationId: z.uuid(),
  fingerprint: z.string().length(64),
  at: z.number().int().nonnegative(),
  reportApplied: z.boolean().optional(),
})
type BattleSync = z.infer<typeof battleSyncSchema>

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
      const metadata = (body as { $sync?: Partial<BattleSync> }).$sync
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

/** A battle's seats and log with the state they fold to. */
function battleState(ctx: Context, battleId: string) {
  const { seats, log } = battleData(ctx, battleId)
  const state = reduceBattle(
    seats.map((seat) => seat.id),
    log,
    seats.map((seat) => seat.side),
    seats.filter((seat) => seat.automated).map((seat) => seat.id),
  )
  return { seats, log, state }
}

export const battleForOperator = spacetime.procedure({ battleId: t.string() }, t.string(), (ctx, { battleId }) =>
  operatorTx(ctx, (tx) => {
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
  /** A finished battle copied from another tracker, with when each of its commands happened there. */
  imported: z
    .strictObject({
      source: z.enum(IMPORT_SOURCES),
      sourceId: idInput,
      times: z.array(z.number().int().nonnegative()).max(1_000),
      /** Each seat's player in the source, the importing account's first and then the guest's. */
      players: z.tuple([idInput, idInput]),
    })
    .optional(),
  /** The club season fixture this battle plays, which it is linked to as it starts. */
  fixtureKey: z
    .string()
    .max(MAX_ID_LENGTH * 2)
    .optional(),
})

export const createBattle = spacetime.procedure({ payload: t.string() }, t.string(), (ctx, { payload }) =>
  operatorTx(ctx, (tx) => createBattleIn(tx, [payload])),
)

export const battleByToken = spacetime.procedure({ token: t.string() }, t.string(), (ctx, { token }) =>
  operatorTx(ctx, (tx) => {
    const battle = tx.db.battles.token.find(token)
    return productJson(battle ? battleData(tx, battle.id) : null)
  }),
)

const battleFeedQuery = z.strictObject({
  scope: z.enum(['user', 'league', 'club', 'season', 'public', 'friends', 'watchable', 'profile']),
  userId: z.string().max(MAX_ID_LENGTH).nullable(),
  viewerId: z.string().max(MAX_ID_LENGTH).nullable(),
  withUserId: z.string().max(MAX_ID_LENGTH).nullable(),
  leagueToken: z.string().max(MAX_ID_LENGTH).nullable(),
  eventToken: z.string().max(MAX_ID_LENGTH).nullable(),
  // Sent only with the club and season scopes, so a server older than clubs still reads every other feed.
  clubToken: z.string().max(MAX_ID_LENGTH).optional(),
  since: z.number().int().nonnegative().nullable(),
  before: pageCursorInput,
  limit: z.number().int().min(1).max(500),
})

export const battleFeed = spacetime.procedure({ payload: t.string() }, t.string(), (ctx, { payload }) =>
  operatorTx(ctx, (tx) => {
    if (payload.length > 2_000) throw new SenderError('Invalid battle feed')
    const input = decodePayload(battleFeedQuery, payload, 'Invalid battle feed')
    if (
      ((input.scope === 'user' || input.scope === 'friends' || input.scope === 'profile') && !input.userId) ||
      (input.scope === 'league' && (!input.leagueToken || !input.eventToken)) ||
      ((input.scope === 'club' || input.scope === 'season') && !input.clubToken) ||
      (input.scope === 'watchable' && input.since === null)
    ) {
      throw new SenderError('Invalid battle feed scope')
    }

    const event = input.scope === 'league' ? namedHost(tx, input.leagueToken!, input.eventToken!)?.event : undefined
    if (input.scope === 'league' && event?.revealedAt === undefined) return productJson({ battles: [], nextCursor: null })
    const club = input.clubToken ? tx.db.clubs.token.find(input.clubToken) : undefined
    if ((input.scope === 'club' || input.scope === 'season') && !club) return productJson({ battles: [], nextCursor: null })
    const season = input.scope === 'season' ? tx.db.clubSeasons.clubId.find(club!.id) : undefined
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
      } else if (input.scope === 'season') {
        for (const entry of season ? tx.db.leagueEventBattles.eventId.filter(season.id) : []) {
          const battle = tx.db.battles.id.find(entry.battleId)
          if (battle) yield battle
        }
      } else if (input.scope === 'friends') {
        const seen = new Set<string>()
        for (const friendId of friendIds)
          for (const seat of tx.db.battleUsers.userId.filter(friendId)) {
            if (seen.has(seat.battleId)) continue
            seen.add(seat.battleId)
            const battle = tx.db.battles.id.find(seat.battleId)
            if (battle) yield battle
          }
      } else yield* tx.db.battles.iter()
    }
    for (const battle of candidates()) {
      const seats = Array.from(tx.db.battleUsers.battleId.filter(battle.id))
      const seatIds = new Set(seats.map((seat) => seat.userId))
      const hasPractice = seats.some((seat) => Boolean(tx.db.practiceOpponents.userId.find(seat.userId)))
      if (input.scope === 'user' && input.withUserId && !seatIds.has(input.withUserId)) continue
      if (input.scope === 'public' && (hasPractice || (input.viewerId && seatIds.has(input.viewerId)))) continue
      if (input.scope === 'friends' && (hasPractice || seatIds.has(input.userId!))) continue
      const at = safeNumber(input.scope === 'public' || input.scope === 'friends' ? battle.createdAt : lastActivity(tx, battle))
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

/**
 * The battles whose log or seats changed after revision `after`, deleted ones included after a nonzero cursor, and the
 * revision read up to.
 * Read from zero, it first indexes the battles older than `battle_changes`.
 */
export const battleChanges = spacetime.procedure({ after: t.u64() }, t.string(), (ctx, { after }) =>
  operatorTx(ctx, (tx) => {
    if (after === 0n)
      for (const battle of Array.from(tx.db.battles.iter())) if (!tx.db.battleChanges.battleId.find(battle.id)) touchBattle(tx, battle.id)
    const battleIds: string[] = []
    // A reader from zero holds nothing to evict, so it skips the markers deleted battles leave.
    const revision = tx.db.publicRevisions.scope.find('battles')?.revision ?? 0n
    // A battle's row holds the revision it last changed at, so a short way behind reads each revision since; far behind, the whole table.
    const rows =
      revision - after > BigInt(CHANGES_SCANNED_BY_REVISION)
        ? Array.from(tx.db.battleChanges.iter()).filter((row) => row.revision > after)
        : Array.from({ length: Number(revision - after) }, (_, at) =>
            Array.from(tx.db.battleChanges.revision.filter(after + 1n + BigInt(at))),
          ).flat()
    for (const row of rows) if (after > 0n || tx.db.battles.id.find(row.battleId)) battleIds.push(row.battleId)
    return productJson({ cursor: revision, battleIds })
  }),
)

/** The battles still held among these ids. */
export const battlesForOperator = spacetime.procedure({ battleIds: t.array(t.string()) }, t.string(), (ctx, { battleIds }) =>
  operatorTx(ctx, (tx) => {
    if (battleIds.length > 500) throw new SenderError('Too many battles')
    return productJson(battleIds.flatMap((battleId) => (tx.db.battles.id.find(battleId) ? [battleData(tx, battleId)] : [])))
  }),
)

const STANDINGS = 'standings'
const ACHIEVEMENTS = 'achievements'
/** How long one server holds the standings refresh before another may take it over. */
const STANDINGS_HOLD_MS = 120_000n
/** How long ratings another catalogue's armies named are left alone, so two releases serving through a deploy do not take turns replaying. */
const VERSIONS_SETTLE_MS = 600_000n
const DAY_MS = 86_400_000n
/** Past this many revisions or days, reading a table whole is cheaper than looking each one up. */
const CHANGES_SCANNED_BY_REVISION = 5_000
const DAYS_SCANNED_BY_DAY = 400

const finishedDay = (at: bigint) => Number(at / DAY_MS)

/**
 * Rows that finished at or after `from`, read day by day from its day to tomorrow's, or the whole table when that is
 * further back than `DAYS_SCANNED_BY_DAY`. A range scan would read them in one go, but the module test host cannot run one.
 */
function finishedSince<T extends { finishedAt: bigint }>(
  ctx: Context,
  byDay: { filter(day: number): Iterable<T> },
  all: () => Iterable<T>,
  from: bigint,
) {
  const first = finishedDay(from)
  const last = finishedDay(nowMs(ctx)) + 1
  const rows =
    last - first > DAYS_SCANNED_BY_DAY
      ? Array.from(all())
      : Array.from({ length: Math.max(0, last - first + 1) }, (_, at) => Array.from(byDay.filter(first + at))).flat()
  return rows.filter((row) => row.finishedAt >= from)
}
const RESULTS_PER_WRITE = 500
const STEPS_PER_WRITE = 2_000

function derivedState(ctx: Context, name: string) {
  const current = ctx.db.derivedState.name.find(name)
  if (current) return current
  const created = {
    name,
    cursor: 0n,
    seen: 0n,
    version: '',
    ratings: '',
    versionsAt: 0n,
    ratingsFrom: undefined,
    replays: 0n,
    holder: '',
    heldUntil: 0n,
  }
  ctx.db.derivedState.insert(created)
  return created
}

function nowMs(ctx: Context) {
  return ctx.timestamp.microsSinceUnixEpoch / 1_000n
}

/** The standings state, refusing a server that no longer holds the refresh, and holding it a while longer for one that does. */
function heldStandings(ctx: Context, holder: string) {
  const state = derivedState(ctx, STANDINGS)
  if (!holder || state.holder !== holder) throw new SenderError('Standings refresh not held')
  const held = { ...state, heldUntil: nowMs(ctx) + STANDINGS_HOLD_MS }
  ctx.db.derivedState.name.update(held)
  return held
}

/**
 * Rises with every write that can change a stored result or rating, and with every refresh that changed one, so a refresh
 * is needed only once it has moved and a server can hold one leaderboard read until it does.
 */
const standingsRevision = (ctx: Context) => ctx.db.publicRevisions.scope.find('standings')?.revision ?? 0n

/** Ratings must be replayed from this finish on; the count tells a refresh that read an earlier ask that another came since. */
function replayRatingsFrom(ctx: Context, from: bigint) {
  const state = derivedState(ctx, STANDINGS)
  ctx.db.derivedState.name.update({
    ...state,
    ratingsFrom: state.ratingsFrom === undefined || from < state.ratingsFrom ? from : state.ratingsFrom,
    replays: state.replays + 1n,
  })
}

/** Whether a battle counts for the leaderboard turns on who is a practice opponent, so every rating replays and their opponents' medals are checked again. */
function practiceChanged(ctx: Context, userId: string) {
  replayRatingsFrom(ctx, 0n)
  for (const seat of ctx.db.battleUsers.userId.filter(userId))
    for (const other of ctx.db.battleUsers.battleId.filter(seat.battleId)) recheckAchievements(ctx, other.userId, true)
}

/**
 * A write that could change what this player has earned; `signal` tells their devices to look, for writes no other signal
 * reports. A player with no revisions is a guest or a deleted account, which nobody reads medals for.
 */
function recheckAchievements(ctx: Context, userId: string, signal = false) {
  if (isGuestSeat(userId) || !ctx.db.productRevisions.userId.filter(userId).next().value) return
  const check = ctx.db.achievementChecks.userId.find(userId)
  if (check) ctx.db.achievementChecks.userId.update({ ...check, revision: check.revision + 1n })
  else ctx.db.achievementChecks.insert({ userId, revision: 1n, checked: 0n, quiet: false })
  if (signal) touchProduct(ctx, userId, 'achievements')
}

/** Everyone whose medals a battle's result can move: its seats, its club's members and its event's players and organizers. */
function battleAchievers(ctx: Context, battleId: string, seats: readonly string[]) {
  const users = new Set(seats)
  const link = ctx.db.leagueEventBattles.battleId.find(battleId)
  const event = link && ctx.db.sealedEvents.id.find(link.eventId)
  const host = event && hostOfEvent(ctx, event)
  if (host) {
    for (const userId of hostOrganizerIds(ctx, host)) users.add(userId)
    for (const entry of ctx.db.leagueEventEntries.eventId.filter(host.event.id)) users.add(entry.userId)
  }
  const clubId = ctx.db.clubBattles.battleId.find(battleId)?.clubId ?? (host?.kind === 'club' ? host.club.id : undefined)
  const club = clubId === undefined ? undefined : ctx.db.clubs.id.find(clubId)
  if (club) {
    users.add(club.ownerId)
    for (const member of ctx.db.clubMembers.clubId.filter(club.id)) users.add(member.userId)
  }
  return users
}

const storedResult = z.looseObject({ playerIds: z.array(z.string()) })
const resultWrite = z.object({
  holder: z.string(),
  results: z
    .array(z.object({ battleId: z.string(), finishedAt: z.number().int().nonnegative(), result: z.string() }))
    .max(RESULTS_PER_WRITE),
  removed: z.array(z.string()).max(RESULTS_PER_WRITE),
})
const stepWrite = z.object({
  holder: z.string(),
  from: z.number().int().nonnegative(),
  first: z.boolean(),
  steps: z
    .array(
      z.object({
        table: z.string(),
        playerId: z.string(),
        battleId: z.string(),
        finishedAt: z.number().int().nonnegative(),
        mu: z.number(),
        sigma: z.number(),
        rating: z.number().int(),
        change: z.number().int(),
        battles: z.number().int().nonnegative(),
        won: z.number().int().nonnegative(),
        lost: z.number().int().nonnegative(),
        drawn: z.number().int().nonnegative(),
        points: z.number(),
      }),
    )
    .max(STEPS_PER_WRITE),
})

type RatingStep = NonNullable<ReturnType<Context['db']['ratingSteps']['key']['find']>>

const laterStep = (one: { finishedAt: bigint; battleId: string }, other: { finishedAt: bigint; battleId: string }) =>
  one.finishedAt > other.finishedAt || (one.finishedAt === other.finishedAt && one.battleId > other.battleId)

/** Points a player's row in one table at their latest step in it, or removes the row once they have none. */
function settleStanding(ctx: Context, holder: string) {
  let latest: RatingStep | undefined
  for (const step of ctx.db.ratingSteps.holder.filter(holder)) if (!latest || laterStep(step, latest)) latest = step
  ctx.db.standings.holder.delete(holder)
  if (latest) ctx.db.standings.insert(standingOf(latest))
}

function standingOf({ key: _key, change: _change, finishedDay: _day, ...step }: RatingStep) {
  return step
}

/**
 * Takes the standings refresh for `holder` unless nothing that could change a result or rating has happened since the last
 * one with these versions, or another server holds it. A new results version rereads every battle; a new ratings version
 * replays every rating. During a deploy two releases can hold different versions, so an older one, one without a catalogue,
 * or one whose catalogue names armies differently from ratings written in the last few minutes reads what is stored
 * rather than undo the other's work.
 */
export const claimStandingsRefresh = spacetime.procedure(
  { holder: t.string(), results: t.string(), ratings: t.string() },
  t.string(),
  (ctx, input) =>
    operatorTx(ctx, (tx) => {
      const state = derivedState(tx, STANDINGS)
      const standings = standingsRevision(tx)
      const same = state.version === input.results && state.ratings === input.ratings
      if (same && state.ratingsFrom === undefined && state.seen === standings) return productJson({ state: 'fresh', standings })
      const now = nowMs(tx)
      const generation = (version: string) => Number(version.split(':')[0]) || 0
      const armies = (version: string) => version.split(':')[1] ?? ''
      const outdated =
        generation(input.results) < generation(state.version) ||
        generation(input.ratings) < generation(state.ratings) ||
        // A server without a catalogue names no armies, which would drop every army's table.
        (armies(input.ratings) === '' && armies(state.ratings) !== '') ||
        (generation(input.ratings) === generation(state.ratings) &&
          armies(input.ratings) !== armies(state.ratings) &&
          armies(state.ratings) !== '' &&
          state.versionsAt + VERSIONS_SETTLE_MS > now)
      if ((state.holder !== input.holder && state.heldUntil > now) || outdated) return productJson({ state: 'busy', standings })
      const claimed = { ...state, holder: input.holder, heldUntil: now + STANDINGS_HOLD_MS }
      if (state.version !== input.results) {
        claimed.cursor = 0n
        // Read from zero, battle_changes leaves out deleted battles, so their results go here.
        for (const row of Array.from(tx.db.battleResults.iter()))
          if (!tx.db.battles.id.find(row.battleId)) {
            tx.db.battleResults.battleId.delete(row.battleId)
            if (claimed.ratingsFrom === undefined || row.finishedAt < claimed.ratingsFrom) claimed.ratingsFrom = row.finishedAt
          }
      }
      if (state.ratings !== input.ratings) {
        claimed.ratingsFrom = 0n
        claimed.replays += 1n
      }
      tx.db.derivedState.name.update(claimed)
      return productJson({
        state: 'claimed',
        cursor: claimed.cursor,
        ratingsFrom: claimed.ratingsFrom ?? null,
        replays: claimed.replays,
        standings,
      })
    }),
)

/**
 * Stores the results the refresh folded and drops those of battles no longer finished. Each result that changed moves
 * the replay point back to its finish and has everyone whose medals it can move checked again. Answers the replay point,
 * how often a replay was asked for, and whether any result changed.
 */
export const saveBattleResults = spacetime.procedure({ payload: t.string() }, t.string(), (ctx, { payload }) =>
  operatorTx(ctx, (tx) => {
    const input = decodePayload(resultWrite, payload, 'Invalid battle results')
    heldStandings(tx, input.holder)
    let moved = false
    const changed = (
      battleId: string,
      before: { finishedAt: bigint; result: string } | null,
      after: { finishedAt: bigint; result: string } | null,
    ) => {
      if (before?.result === after?.result && before?.finishedAt === after?.finishedAt) return
      moved = true
      for (const row of [before, after]) if (row) replayRatingsFrom(tx, row.finishedAt)
      const seats = [before, after].flatMap((row) => (row ? storedResult.parse(JSON.parse(row.result)).playerIds : []))
      for (const userId of battleAchievers(tx, battleId, seats)) recheckAchievements(tx, userId, true)
    }
    for (const { battleId, finishedAt: at, result } of input.results) {
      const before = tx.db.battleResults.battleId.find(battleId) ?? null
      const after = { battleId, finishedAt: BigInt(at), finishedDay: finishedDay(BigInt(at)), result }
      if (before) tx.db.battleResults.battleId.update(after)
      else tx.db.battleResults.insert(after)
      changed(battleId, before, after)
    }
    for (const battleId of input.removed) {
      const before = tx.db.battleResults.battleId.find(battleId)
      if (!before) continue
      tx.db.battleResults.battleId.delete(battleId)
      changed(battleId, before, null)
    }
    const state = derivedState(tx, STANDINGS)
    return productJson({ ratingsFrom: state.ratingsFrom ?? null, replays: state.replays, changed: moved })
  }),
)

/** Stored results that finished after the one named, oldest first, a page at a time; an empty id starts at `afterAt` itself. */
export const battleResultsAfter = spacetime.procedure({ afterAt: t.u64(), afterId: t.string(), limit: t.u32() }, t.string(), (ctx, input) =>
  operatorTx(ctx, (tx) => {
    const after = { finishedAt: input.afterAt, battleId: input.afterId }
    const rows = finishedSince(tx, tx.db.battleResults.finishedDay, () => tx.db.battleResults.iter(), input.afterAt)
      .filter((row) => laterStep(row, after))
      .sort((one, other) => (laterStep(one, other) ? 1 : -1))
      .slice(0, Math.min(input.limit, 5_000))
    return productJson(rows)
  }),
)

/** Each of these players' latest step in each table before `from`, which a replay from there starts them on. */
export const ratingsBefore = spacetime.procedure({ from: t.u64(), playerIds: t.array(t.string()) }, t.string(), (ctx, input) =>
  operatorTx(ctx, (tx) => {
    if (input.playerIds.length > 500) throw new SenderError('Too many players')
    const latest = new Map<string, RatingStep>()
    for (const playerId of input.playerIds)
      for (const step of tx.db.ratingSteps.playerId.filter(playerId)) {
        if (step.finishedAt >= input.from) continue
        const known = latest.get(step.holder)
        if (!known || laterStep(step, known)) latest.set(step.holder, step)
      }
    return productJson([...latest.values()].map(standingOf))
  }),
)

/**
 * Writes replayed steps in the order their battles finished. The first write of a replay drops every step from `from` on,
 * and each write points the players it moves at their latest step.
 */
export const saveRatingSteps = spacetime.procedure({ payload: t.string() }, t.bool(), (ctx, { payload }) =>
  operatorTx(ctx, (tx) => {
    const input = decodePayload(stepWrite, payload, 'Invalid rating steps')
    heldStandings(tx, input.holder)
    if (input.first) {
      const holders = new Set<string>()
      for (const step of finishedSince(tx, tx.db.ratingSteps.finishedDay, () => tx.db.ratingSteps.iter(), BigInt(input.from))) {
        tx.db.ratingSteps.key.delete(step.key)
        holders.add(step.holder)
      }
      for (const holder of holders) settleStanding(tx, holder)
    }
    for (const step of input.steps) {
      const holder = JSON.stringify([step.table, step.playerId])
      const at = BigInt(step.finishedAt)
      const row = {
        ...step,
        key: JSON.stringify([step.table, step.playerId, step.battleId]),
        holder,
        finishedAt: at,
        finishedDay: finishedDay(at),
      }
      tx.db.ratingSteps.key.delete(row.key)
      tx.db.ratingSteps.insert(row)
      const current = tx.db.standings.holder.find(holder)
      if (!current || !laterStep(current, row)) {
        tx.db.standings.holder.delete(holder)
        tx.db.standings.insert(standingOf(row))
      }
    }
    return true
  }),
)

/**
 * Records how far the refresh read, the standings revision it claimed at and its versions, then lets go of it. The replay
 * point clears only if nothing asked for another replay since the refresh last read it. A refresh that changed anything
 * raises the standings signal, so readers that found it busy, and their clients, read again.
 */
export const finishStandingsRefresh = spacetime.procedure(
  {
    holder: t.string(),
    cursor: t.u64(),
    seen: t.u64(),
    results: t.string(),
    ratings: t.string(),
    replayed: t.bool(),
    replays: t.u64(),
    changed: t.bool(),
  },
  t.string(),
  (ctx, input) =>
    operatorTx(ctx, (tx) => {
      const state = heldStandings(tx, input.holder)
      const versioned = state.version !== input.results || state.ratings !== input.ratings
      tx.db.derivedState.name.update({
        ...state,
        cursor: input.cursor,
        seen: input.seen,
        version: input.results,
        ratings: input.ratings,
        versionsAt: versioned ? nowMs(tx) : state.versionsAt,
        ratingsFrom: input.replayed && state.replays === input.replays ? undefined : state.ratingsFrom,
        holder: '',
        heldUntil: 0n,
      })
      if (input.replayed || input.changed) touchPublic(tx, 'standings')
      return standingsRevision(tx).toString()
    }),
)

const standingRow = (row: {
  playerId: string
  rating: number
  battles: number
  won: number
  lost: number
  drawn: number
  points: number
  finishedAt: bigint
}) => ({
  id: row.playerId,
  name: '',
  image: null,
  rating: row.rating,
  battles: row.battles,
  won: row.won,
  lost: row.lost,
  drawn: row.drawn,
  points: row.points,
  lastPlayed: safeNumber(row.finishedAt),
})

/** Every table's players who played since `activeSince`, best first, the first `limit` of each, and how many seats each table has rated. */
export const leaderboard = spacetime.procedure({ activeSince: t.u64(), limit: t.u32() }, t.string(), (ctx, input) =>
  operatorTx(ctx, (tx) => {
    const tables = new Map<string, { seats: number; rows: ReturnType<typeof standingRow>[] }>()
    for (const row of tx.db.standings.iter()) {
      const held = tables.get(row.table) ?? { seats: 0, rows: [] }
      tables.set(row.table, held)
      held.seats += row.battles
      if (row.finishedAt >= input.activeSince) held.rows.push(standingRow(row))
    }
    return productJson(
      [...tables].flatMap(([name, { seats, rows }]) =>
        rows.length ? [{ table: name, seats, players: rows.length, rows: rows.sort(compareStandings).slice(0, input.limit) }] : [],
      ),
    )
  }),
)

/** Where one player sits in each table they played in since `activeSince`, and their overall rating after each counted battle. */
export const playerStandings = spacetime.procedure({ userId: t.string(), activeSince: t.u64() }, t.string(), (ctx, input) =>
  operatorTx(ctx, (tx) => {
    const places = Array.from(tx.db.standings.playerId.filter(input.userId)).flatMap((own) => {
      if (own.finishedAt < input.activeSince) return []
      const standing = standingRow(own)
      let place = 1
      let of = 0
      for (const row of tx.db.standings.table.filter(own.table)) {
        if (row.finishedAt < input.activeSince) continue
        of += 1
        if (row.playerId !== own.playerId && compareStandings(standingRow(row), standing) < 0) place += 1
      }
      return [{ table: own.table, place, of, standing }]
    })
    const history = Array.from(tx.db.ratingSteps.playerId.filter(input.userId))
      .filter((step) => step.table === '')
      .sort((one, other) => (laterStep(one, other) ? 1 : -1))
      .map((step) => ({ at: safeNumber(step.finishedAt), rating: step.rating }))
    return productJson({ places, history })
  }),
)

/** How far each of these battles moved each seat's overall rating, for the battles the leaderboard counts. */
export const ratingChanges = spacetime.procedure({ tokens: t.array(t.string()) }, t.string(), (ctx, { tokens }) =>
  operatorTx(ctx, (tx) => {
    if (tokens.length > 500) throw new SenderError('Too many battles')
    return productJson(
      tokens.flatMap((token) => {
        const battle = tx.db.battles.token.find(token)
        const steps = battle ? Array.from(tx.db.ratingSteps.battleId.filter(battle.id)).filter((step) => step.table === '') : []
        return steps.length ? [{ token, changes: Object.fromEntries(steps.map((step) => [step.playerId, step.change])) }] : []
      }),
    )
  }),
)

/** The stored results of every finished battle this player sits in. */
export const battleResultsByUser = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  operatorTx(ctx, (tx) =>
    productJson(
      Array.from(tx.db.battleUsers.userId.filter(userId)).flatMap((seat) => {
        const row = tx.db.battleResults.battleId.find(seat.battleId)
        return row ? [row] : []
      }),
    ),
  ),
)

/** A player's stored medals, and whether a write since their last check could have changed them. */
export const achievementStatus = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  operatorTx(ctx, (tx) => {
    const check = tx.db.achievementChecks.userId.find(userId)
    return productJson({
      revision: check?.revision ?? 0n,
      checked: check?.checked ?? 0n,
      earned: Array.from(tx.db.earnedAchievements.userId.filter(userId)).flatMap(({ achievementId, earnedAt, held, seen }) =>
        held ? [{ achievementId, earnedAt: earnedAt ?? null, seen }] : [],
      ),
    })
  }),
)

const achievementWrite = z.object({
  userId: z.string(),
  revision: z.number().int().nonnegative(),
  definitions: z.string(),
  earned: z.array(z.object({ achievementId: z.string(), earnedAt: z.number().int().nonnegative().nullable() })).max(500),
})

/**
 * Stores what a check found, unless a write since the revision it started from could have changed it, or it checked
 * against other medals than the ones every player was last checked against. A medal new to the player is unseen unless
 * the check is quiet, and one they no longer hold goes without a word.
 */
export const saveAchievements = spacetime.procedure({ payload: t.string() }, t.bool(), (ctx, { payload }) =>
  operatorTx(ctx, (tx) => {
    const input = decodePayload(achievementWrite, payload, 'Invalid achievements')
    const check = tx.db.achievementChecks.userId.find(input.userId)
    if (!check || check.revision !== BigInt(input.revision) || derivedState(tx, ACHIEVEMENTS).version !== input.definitions) return false
    const stored = new Map(Array.from(tx.db.earnedAchievements.userId.filter(input.userId), (row) => [row.achievementId, row]))
    let moved = false
    for (const { achievementId, earnedAt } of input.earned) {
      const at = earnedAt === null ? undefined : BigInt(earnedAt)
      const known = stored.get(achievementId)
      stored.delete(achievementId)
      if (known?.held && known.earnedAt === at) continue
      if (known) tx.db.earnedAchievements.key.update({ ...known, earnedAt: at, held: true })
      else
        tx.db.earnedAchievements.insert({
          key: JSON.stringify([input.userId, achievementId]),
          userId: input.userId,
          achievementId,
          earnedAt: at,
          held: true,
          seen: check.quiet,
        })
      moved = true
    }
    for (const row of stored.values())
      if (row.held) {
        tx.db.earnedAchievements.key.update({ ...row, held: false })
        moved = true
      }
    tx.db.achievementChecks.userId.update({ ...check, checked: check.revision, quiet: false })
    if (moved) touchProduct(tx, input.userId, 'achievements')
    return true
  }),
)

export const markAchievementsSeen = spacetime.procedure(
  { userId: t.string(), achievementIds: t.array(t.string()) },
  t.bool(),
  (ctx, input) =>
    operatorTx(ctx, (tx) => {
      if (input.achievementIds.length > 500) throw new SenderError('Too many achievements')
      let moved = false
      for (const achievementId of input.achievementIds) {
        const row = tx.db.earnedAchievements.key.find(JSON.stringify([input.userId, achievementId]))
        if (!row?.held || row.seen) continue
        tx.db.earnedAchievements.key.update({ ...row, seen: true })
        moved = true
      }
      if (moved) touchProduct(tx, input.userId, 'achievements')
      return moved
    }),
)

/**
 * Has every player checked again, quietly, when the medals on offer change, and answers whether they had. Every player
 * who has done anything has a revision row, so those are the players to check.
 */
export const syncAchievementDefinitions = spacetime.procedure({ version: t.string() }, t.bool(), (ctx, { version }) =>
  operatorTx(ctx, (tx) => {
    const state = derivedState(tx, ACHIEVEMENTS)
    if (state.version === version) return false
    const users = new Set(Array.from(tx.db.productRevisions.iter(), (row) => row.userId))
    for (const check of tx.db.achievementChecks.iter()) users.add(check.userId)
    for (const userId of users) {
      recheckAchievements(tx, userId)
      tx.db.achievementChecks.userId.update({ ...tx.db.achievementChecks.userId.find(userId)!, quiet: true })
    }
    tx.db.derivedState.name.update({ ...state, version })
    return true
  }),
)

export const removeBattle = spacetime.procedure({ battleId: t.string(), userId: t.string() }, t.bool(), (ctx, input) =>
  operatorTx(ctx, (tx) => removeBattleIn(tx, [input.battleId, input.userId])),
)

export const deleteBattleForOperator = spacetime.procedure({ battleId: t.string() }, t.bool(), (ctx, { battleId }) =>
  operatorTx(ctx, (tx) => {
    if (!tx.db.battles.id.find(battleId)) return false
    deleteBattle(tx, battleId)
    return true
  }),
)

export const submitBattle = spacetime.procedure(
  { battleId: t.string(), userId: t.string(), expectedSeq: t.u32(), body: t.string(), now: t.u64(), externalRefusal: t.string() },
  t.string(),
  (ctx, input) =>
    operatorTx(ctx, (tx) => {
      if (input.body.length > 1_000_000) throw new SenderError('Battle command is too large')
      const raw = decodePayload(z.looseObject({ $sync: battleSyncSchema.optional() }), input.body, 'Invalid battle command')
      const sync = raw.$sync
      const parsed = commandSchema.safeParse(raw)
      if (!parsed.success) throw new SenderError('Invalid battle command')
      const { seats, log, state } = battleState(tx, input.battleId)
      const appliedReport = sync?.reportApplied ? { applied: false } : {}
      if (sync) {
        const previous = log.find((entry) => entry.operationId === sync.operationId)
        if (previous) {
          const stored = tx.db.commands.key.find(JSON.stringify([input.battleId, previous.seq]))!
          const metadata = (JSON.parse(stored.body) as { $sync: BattleSync }).$sync
          if (previous.by !== input.userId || metadata.fingerprint !== sync.fingerprint)
            throw new SenderError('Operation ID reused for a different action')
          return productJson({ result: { outcome: 'appended', seq: previous.seq }, log, ...appliedReport })
        }
      }
      if (input.expectedSeq !== state.seq) return productJson({ result: { outcome: 'stale', seq: state.seq }, log, ...appliedReport })
      // Only reopening a finished result, directly or by undoing its end, depends on who runs a Swiss table.
      const swiss =
        state.status === 'finished' && (parsed.data.kind === 'reopen-battle' || parsed.data.kind === 'undo')
          ? swissTable(tx, input.battleId)
          : null
      const isOrganizer = Boolean(swiss?.organizerIds.includes(input.userId))
      const refusal =
        validate(state, input.userId, parsed.data, isOrganizer) ??
        (parsed.data.kind === 'set-battle-club' && parsed.data.clubId && !battleClubIds(tx, seats).includes(parsed.data.clubId)
          ? CLUB_MEMBERS_ONLY
          : null) ??
        (swiss && swissResultLocked({ ...swiss, isOrganizer }) ? SWISS_RESULT_LOCKED : null)
      if (refusal) return productJson({ result: { outcome: 'refused', reason: refusal }, log, ...appliedReport })
      if (input.externalRefusal) {
        if (input.externalRefusal.length > 1_000) throw new SenderError('Invalid battle refusal')
        return productJson({ result: { outcome: 'refused', reason: input.externalRefusal }, log, ...appliedReport })
      }
      const seq = state.seq + 1
      const at = sync ? BigInt(Math.max(log.at(-1)?.at ?? 0, Math.min(sync.at, safeNumber(input.now)))) : input.now
      tx.db.commands.insert({
        key: JSON.stringify([input.battleId, seq]),
        battleId: input.battleId,
        seq,
        userId: input.userId,
        at,
        body: JSON.stringify({ ...parsed.data, ...(sync ? { $sync: sync } : {}) }),
      })
      for (const seat of seats) touchProduct(tx, seat.id, 'battles')
      touchBattle(tx, input.battleId)
      // A result can change only on a finished battle or one this command finishes; an undo is not refolded here, so it always counts.
      const wasFinished = state.status === 'finished'
      if (!wasFinished && parsed.data.kind !== 'undo')
        applyEntry(state, { seq, by: input.userId, at: safeNumber(at), command: parsed.data })
      if (wasFinished || parsed.data.kind === 'undo' || state.status === 'finished') touchPublic(tx, 'standings')
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
  operatorTx(ctx, (tx) => {
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
    operatorTx(ctx, (tx) => {
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
  operatorTx(ctx, (tx) => {
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
  operatorTx(ctx, (tx) => {
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
  operatorTx(ctx, (tx) => {
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
    operatorTx(ctx, (tx) => {
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
      const { seats, state } = battleState(tx, input.battleId)
      const refusal = guestClaimRefusal(
        state,
        seats.map((one) => one.id),
        input.userId,
      )
      if (refusal) return productJson(refusal)
      claimSeat(tx, seat, input.userId, seats)
      return productJson('claimed')
    }),
)

/** Puts an account on a guest seat for good: the log keeps the seat, which every read names as the account. */
function claimSeat(ctx: Context, seat: ReturnType<typeof guestSeatIn>, userId: string, seats: readonly { id: string }[]) {
  ctx.db.battleUsers.key.delete(seat.key)
  ctx.db.battleUsers.insert({
    ...seat,
    key: JSON.stringify([seat.battleId, userId]),
    userId,
    guestName: undefined,
    claimedSeat: seat.userId,
  })
  ctx.db.guestSeats.seatId.delete(seat.userId)
  endGuestSessions(ctx, seat.userId)
  for (const one of [...seats.map((other) => other.id), userId]) touchProduct(ctx, one, 'battles', 'onboarding')
  touchBattle(ctx, seat.battleId)
  touchPublic(ctx, 'standings')
  touchAdmin(ctx)
}

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
  operatorTx(ctx, (tx) => {
    if (!validId(userId)) throw new SenderError('Invalid user ID')
    const rows = [...Array.from(tx.db.friendships.requesterId.filter(userId)), ...Array.from(tx.db.friendships.addresseeId.filter(userId))]
    if (rows.length > 1_000) throw new SenderError('Too many friendships')
    return productJson(
      rows.map(({ requesterId, addresseeId, acceptedAt }) => ({ requesterId, addresseeId, acceptedAt: acceptedAt ?? null })),
    )
  }),
)

export const productStats = spacetime.procedure({ userIds: t.array(t.string()) }, t.string(), (ctx, { userIds }) =>
  operatorTx(ctx, (tx) => {
    if (userIds.length > 100 || userIds.some((id) => !validId(id))) throw new SenderError('Invalid product stats query')
    return productJson(
      [...new Set(userIds)].map((userId) => ({
        userId,
        rosterCount: Array.from(tx.db.rosters.userId.filter(userId)).length,
        battleCount: Array.from(tx.db.battleUsers.userId.filter(userId)).length,
        leagueCount: Array.from(tx.db.tournaments.ownerId.filter(userId)).length,
        friendCount: [...tx.db.friendships.requesterId.filter(userId), ...tx.db.friendships.addresseeId.filter(userId)].filter(
          (row) => row.acceptedAt !== undefined,
        ).length,
        practiceOpponent: Boolean(tx.db.practiceOpponents.userId.find(userId)),
      })),
    )
  }),
)

const PRACTICE_OPPONENTS_MAX = 100

const externalPlayer = { source: z.enum(IMPORT_SOURCES), playerId: idInput }
const claimImportedInput = z.strictObject({ ...externalPlayer, sourceId: idInput, userId: idInput })
const linkExternalInput = z.strictObject({
  ...externalPlayer,
  userId: idInput,
  name: z.string().trim().min(1).max(PROFILE_NAME_MAX_LENGTH),
})

/**
 * Seats an account in every copied battle its player sat in as a guest. A seat it cannot take is
 * left as it is: a battle it already sits in, or one still being played. Returns how many it took.
 */
function seatExternalPlayer(ctx: Context, player: string, userId: string, battleId?: string) {
  let seated = 0
  for (const row of Array.from(ctx.db.importedSeats.player.filter(player))) {
    if (battleId !== undefined && row.battleId !== battleId) continue
    const [, seatId] = JSON.parse(row.key) as [string, string]
    const seat = ctx.db.battleUsers.key.find(JSON.stringify([row.battleId, seatId]))
    if (seat?.guestName === undefined) continue
    const { seats, state } = battleState(ctx, row.battleId)
    if (
      guestClaimRefusal(
        state,
        seats.map((one) => one.id),
        userId,
      )
    )
      continue
    claimSeat(ctx, seat, userId, seats)
    seated++
  }
  return seated
}

/**
 * Seats an account in a battle another of its players already copied, on the seat its source
 * player sat in: `absent` when nobody has copied it, `seated` when the account already sits there,
 * `unavailable` when that seat is taken, and `claimed` once the account sits there.
 */
export const claimImportedBattle = spacetime.procedure({ payload: t.string() }, t.string(), (ctx, { payload }) =>
  operatorTx(ctx, (tx) => {
    const input = decodePayload(claimImportedInput, payload, 'Invalid imported battle')
    if (isGuestSeat(input.userId)) throw new SenderError('Invalid user ID')
    const row = tx.db.battleImports.key.find(JSON.stringify([input.source, input.sourceId]))
    if (!row) return productJson('absent')
    if (tx.db.battleUsers.key.find(JSON.stringify([row.battleId, input.userId]))) return productJson('seated')
    const seated = seatExternalPlayer(tx, externalPlayerKey(input.source, input.playerId), input.userId, row.battleId)
    return productJson(seated ? 'claimed' : 'unavailable')
  }),
)

/**
 * Records that an account on another tracker is this player's, once they proved it, and seats them
 * in every battle already copied from it where they sat as a guest. A later proof moves the
 * account to whoever gave it; battles the earlier owner was already seated in stay theirs.
 */
export const linkExternalAccount = spacetime.procedure({ payload: t.string() }, t.u32(), (ctx, { payload }) =>
  operatorTx(ctx, (tx) => {
    const input = decodePayload(linkExternalInput, payload, 'Invalid external account')
    if (isGuestSeat(input.userId)) throw new SenderError('Invalid user ID')
    const key = externalPlayerKey(input.source, input.playerId)
    tx.db.externalAccounts.key.delete(key)
    tx.db.externalAccounts.insert({ key, userId: input.userId, name: input.name })
    return seatExternalPlayer(tx, key, input.userId)
  }),
)

/** The accounts on other trackers a player proved are theirs. */
export const externalAccountsByUser = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  operatorTx(ctx, (tx) =>
    productJson(
      Array.from(tx.db.externalAccounts.userId.filter(userId), (row) => {
        const [source, playerId] = JSON.parse(row.key) as [string, string]
        return { source, playerId, name: row.name }
      }),
    ),
  ),
)

export const practiceOpponentIds = spacetime.procedure({}, t.string(), (ctx) =>
  operatorTx(ctx, (tx) => {
    const ids = Array.from(tx.db.practiceOpponents.iter(), (row) => row.userId)
    if (ids.length > PRACTICE_OPPONENTS_MAX) throw new SenderError('Too many practice opponents')
    return productJson(ids.sort())
  }),
)

export const registerPracticeOpponent = spacetime.reducer({ userId: t.string() }, (ctx, { userId }) => {
  requireOperator(ctx)
  if (!validId(userId)) throw new SenderError('Invalid user ID')
  if (ctx.db.practiceOpponents.userId.find(userId)) return
  if (Array.from(ctx.db.practiceOpponents.iter()).length >= PRACTICE_OPPONENTS_MAX) throw new SenderError('Too many practice opponents')
  ctx.db.practiceOpponents.insert({ userId })
  practiceChanged(ctx, userId)
  touchPublic(ctx, 'opponents')
  touchAdmin(ctx)
})

export const requestFriend = spacetime.procedure(
  { requesterId: t.string(), addresseeId: t.string(), now: t.u64() },
  t.bool(),
  (ctx, input) => operatorTx(ctx, (tx) => requestFriendIn(tx, [input.requesterId, input.addresseeId, input.now])),
)

export const acceptFriend = spacetime.procedure(
  { requesterId: t.string(), addresseeId: t.string(), now: t.u64() },
  t.bool(),
  (ctx, input) => operatorTx(ctx, (tx) => acceptFriendIn(tx, [input.requesterId, input.addresseeId, input.now])),
)

export const rejectFriend = spacetime.procedure({ requesterId: t.string(), addresseeId: t.string() }, t.bool(), (ctx, input) =>
  operatorTx(ctx, (tx) => rejectFriendIn(tx, [input.requesterId, input.addresseeId])),
)

export const removeFriend = spacetime.procedure({ leftId: t.string(), rightId: t.string() }, t.bool(), (ctx, input) =>
  operatorTx(ctx, (tx) => removeFriendIn(tx, [input.leftId, input.rightId])),
)

export const friendInviteByInviter = spacetime.procedure({ inviterId: t.string() }, t.string(), (ctx, { inviterId }) =>
  operatorTx(ctx, (tx) => {
    return productJson(tx.db.friendInvites.inviterId.find(inviterId)?.token ?? null)
  }),
)

export const friendInviteByToken = spacetime.procedure({ token: t.string() }, t.string(), (ctx, { token }) =>
  operatorTx(ctx, (tx) => {
    const invite = tx.db.friendInvites.token.find(token)
    return productJson(invite ? { token: invite.token, inviterId: invite.inviterId } : null)
  }),
)

export const replaceFriendInvite = spacetime.reducer({ inviterId: t.string(), token: t.string(), now: t.u64() }, (ctx, input) => {
  requireOperator(ctx)
  replaceFriendInviteIn(ctx, [input.inviterId, input.token, input.now])
})

export const cancelFriendInvite = spacetime.procedure({ inviterId: t.string() }, t.bool(), (ctx, { inviterId }) =>
  operatorTx(ctx, (tx) => cancelFriendInviteIn(tx, [inviterId])),
)

export const acceptFriendInvite = spacetime.procedure(
  { token: t.string(), recipientId: t.string(), now: t.u64() },
  t.string(),
  (ctx, input) => operatorTx(ctx, (tx) => acceptFriendInviteIn(tx, [input.token, input.recipientId, input.now])),
)

export const shareBattle = spacetime.procedure({ userId: t.string(), otherId: t.string() }, t.bool(), (ctx, input) =>
  operatorTx(ctx, (tx) => {
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
      league: Boolean(
        ctx.db.tournaments.ownerId.filter(userId).next().value || ctx.db.leagueEventEntries.userId.filter(userId).next().value,
      ),
    },
  }
}

export const onboardingByUser = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  operatorTx(ctx, (tx) => {
    return productJson(onboardingData(tx, userId))
  }),
)

export const updateOnboarding = spacetime.procedure(
  { userId: t.string(), operation: t.string(), task: t.string() },
  t.string(),
  (ctx, input) => operatorTx(ctx, (tx) => updateOnboardingIn(tx, [input.userId, input.operation, input.task])),
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
  operatorTx(ctx, (tx) => {
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
  operatorTx(ctx, (tx) => {
    if (!validId(id)) throw new SenderError('Invalid roster ID')
    return productJson(tx.db.rosters.id.find(id) ?? null)
  }),
)

export const rostersByUser = spacetime.procedure(
  { userId: t.string(), publicOnly: t.bool(), limit: t.u32() },
  t.string(),
  (ctx, { userId, publicOnly, limit }) =>
    operatorTx(ctx, (tx) => {
      if (!validId(userId) || limit < 1 || limit > 1_000) throw new SenderError('Invalid roster query')
      const rows = Array.from(tx.db.rosters.userId.filter(userId))
        .filter((row) => !publicOnly || row.visibility === 'public')
        .sort((left, right) => (right.createdAt > left.createdAt ? 1 : right.createdAt < left.createdAt ? -1 : 0))
      if (!publicOnly && rows.length > limit) throw new SenderError('Roster list exceeds the supported limit')
      return productJson(rows.slice(0, limit))
    }),
)

export const discoverRosters = spacetime.procedure({ payload: t.string() }, t.string(), (ctx, { payload }) =>
  operatorTx(ctx, (tx) => {
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
  operatorTx(ctx, (tx) => {
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
    operatorTx(ctx, (tx) => {
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
  operatorTx(ctx, (tx) => {
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
  operatorTx(ctx, (tx) => {
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

function ownedRoster(ctx: Context, id: string, userId: string) {
  const roster = ctx.db.rosters.id.find(id)
  return roster?.userId === userId ? roster : null
}

/** Always past the stored version, so every device sees an edit even when clocks disagree. */
function nextVersion(current: StoredRoster | null, now: bigint) {
  return current && current.updatedAt >= now ? current.updatedAt + 1n : now
}

function deleteRosterRow(ctx: Context, roster: StoredRoster) {
  endLoans(ctx, roster.id)
  ctx.db.rosters.id.delete(roster.id)
  touchProduct(ctx, roster.userId, 'rosters', 'onboarding')
  if (roster.visibility !== 'private') touchPublic(ctx, 'rosters')
  touchAdmin(ctx)
}

function updateOwnedRoster(
  ctx: Context,
  id: string,
  userId: string,
  now: bigint,
  patch: Partial<Pick<StoredRoster, 'visibility' | 'locked' | 'archived'>>,
) {
  const current = ownedRoster(ctx, id, userId)
  if (!current) return false
  const next = { ...current, ...patch, updatedAt: nextVersion(current, now) }
  ctx.db.rosters.id.update(next)
  touchProduct(ctx, userId, 'rosters')
  if (current.visibility !== 'private' || next.visibility !== 'private') touchPublic(ctx, 'rosters')
  return true
}

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
    updatedAt: nextVersion(current, now),
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
  return operatorTx(ctx, (tx) => {
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
  return operatorTx(ctx, (tx) => {
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
        deleteRosterRow(tx, current)
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
    operatorTx(ctx, (tx) => {
      if (!(ROSTER_VISIBILITIES as readonly string[]).includes(visibility)) throw new SenderError('Invalid roster visibility')
      return updateOwnedRoster(tx, id, userId, now, { visibility })
    }),
)

export const setRosterLocked = spacetime.procedure(
  { id: t.string(), userId: t.string(), locked: t.bool(), now: t.u64() },
  t.bool(),
  (ctx, { id, userId, locked, now }) => operatorTx(ctx, (tx) => updateOwnedRoster(tx, id, userId, now, { locked })),
)

export const setRosterArchived = spacetime.procedure(
  { id: t.string(), userId: t.string(), archived: t.bool(), now: t.u64() },
  t.bool(),
  (ctx, { id, userId, archived, now }) => operatorTx(ctx, (tx) => updateOwnedRoster(tx, id, userId, now, { archived })),
)

export const deleteRoster = spacetime.reducer({ id: t.string(), userId: t.string() }, (ctx, { id, userId }) => {
  requireOperator(ctx)
  const current = ownedRoster(ctx, id, userId)
  if (current) deleteRosterRow(ctx, current)
})

export const lendRoster = spacetime.procedure(
  { rosterId: t.string(), ownerId: t.string(), borrowerId: t.string(), now: t.u64() },
  t.string(),
  (ctx, { rosterId, ownerId, borrowerId, now }) =>
    operatorTx(ctx, (tx) => {
      if (!ownedRoster(tx, rosterId, ownerId)) return 'forbidden'
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
    operatorTx(ctx, (tx) => {
      const loan = tx.db.rosterLoans.key.find(JSON.stringify([rosterId, borrowerId]))
      if (!loan || (userId !== loan.ownerId && userId !== loan.borrowerId)) return false
      endLoan(tx, loan)
      return true
    }),
)

export const rosterLoansByRoster = spacetime.procedure({ rosterId: t.string(), ownerId: t.string() }, t.string(), (ctx, input) =>
  operatorTx(ctx, (tx) => {
    if (!ownedRoster(tx, input.rosterId, input.ownerId)) return productJson([])
    return productJson(
      Array.from(tx.db.rosterLoans.rosterId.filter(input.rosterId))
        .filter((loan) => activeLoan(tx, loan.rosterId, loan.borrowerId))
        .map((loan) => ({ borrowerId: loan.borrowerId, lentAt: safeNumber(loan.lentAt) })),
    )
  }),
)

/** A roster its owner may field, or a friend may field through an active loan. */
export const usableRoster = spacetime.procedure({ id: t.string(), userId: t.string() }, t.string(), (ctx, { id, userId }) =>
  operatorTx(ctx, (tx) => {
    const row = tx.db.rosters.id.find(id)
    if (!row || !userId) return productJson(null)
    if (row.userId === userId) return productJson({ roster: row, lentBy: null })
    return productJson(activeLoan(tx, id, userId) ? { roster: row, lentBy: row.userId } : null)
  }),
)

export const rostersLentTo = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  operatorTx(ctx, (tx) => {
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
  operatorTx(ctx, (tx) => {
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
  operatorTx(ctx, (tx) => {
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
    operatorTx(ctx, (tx) => {
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
  requireOperator(ctx)
  addToCollectionIn(ctx, [input.userId, input.entryId, input.at])
})

export const removeFromCollection = spacetime.reducer({ userId: t.string(), entryId: t.string() }, (ctx, input) => {
  requireOperator(ctx)
  removeFromCollectionIn(ctx, [input.userId, input.entryId])
})

export const setCollectionModels = spacetime.reducer(
  { userId: t.string(), entryId: t.string(), models: t.u32(), at: t.u64() },
  (ctx, input) => {
    requireOperator(ctx)
    setCollectionModelsIn(ctx, [input.userId, input.entryId, input.models, input.at])
  },
)

export const setCollectionProgress = spacetime.reducer(
  { userId: t.string(), entryId: t.string(), built: t.u32(), painted: t.u32() },
  (ctx, input) => {
    requireOperator(ctx)
    setCollectionProgressIn(ctx, [input.userId, input.entryId, input.built, input.painted])
  },
)

export const setCollectionCountsAs = spacetime.reducer(
  { userId: t.string(), entryId: t.string(), countsAs: t.array(t.string()) },
  (ctx, input) => {
    requireOperator(ctx)
    setCollectionCountsAsIn(ctx, [input.userId, input.entryId, input.countsAs])
  },
)

export const setCollectionWanted = spacetime.reducer(
  { userId: t.string(), entryId: t.string(), wanted: t.u32(), at: t.u64() },
  (ctx, input) => {
    requireOperator(ctx)
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
    operatorTx(ctx, (tx) => {
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
    operatorTx(ctx, (tx) => {
      const row = tx.db.collectionPhotos.photoId.find(photoId)
      return productJson(row && photoShown(row, viewerId) ? { userId: row.userId, entryId: row.entryId } : null)
    }),
)

/** The photo's owner whatever its visibility, for an administrator reviewing it. */
export const collectionPhotoForAdmin = spacetime.procedure({ photoId: t.string() }, t.string(), (ctx, { photoId }) =>
  operatorTx(ctx, (tx) => {
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
    operatorTx(ctx, (tx) => {
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
  operatorTx(ctx, (tx) => {
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
  before: pageCursorInput,
  limit: z.number().int().min(1).max(100),
})

/** Photos awaiting no review, newest first, a page at a time for administrators, with whether others can see each and its likes. */
export const adminCollectionPhotos = spacetime.procedure({ payload: t.string() }, t.string(), (ctx, { payload }) =>
  operatorTx(ctx, (tx) => {
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
  recheckAchievements(ctx, userId, true)
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
    operatorTx(ctx, (tx) => {
      return productJson(
        Array.from(tx.db.collectionPhotos.iter(), (photo) => photo.photoId)
          .filter((photoId) => after === undefined || photoId > after)
          .sort()
          .slice(0, Math.min(limit, 100)),
      )
    }),
)

export const collectionPhotoDeletions = spacetime.procedure({ limit: t.u32() }, t.string(), (ctx, { limit }) =>
  operatorTx(ctx, (tx) => {
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
  operatorTx(ctx, (tx) => {
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
  operatorTx(ctx, (tx) => {
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
  requireOperator(ctx)
  addFavouriteDatasheetIn(ctx, [input.userId, input.entryId, input.at])
})

export const removeFavouriteDatasheet = spacetime.reducer({ userId: t.string(), entryId: t.string() }, (ctx, input) => {
  requireOperator(ctx)
  removeFavouriteDatasheetIn(ctx, [input.userId, input.entryId])
})

export const recentMatchupsByUser = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  operatorTx(ctx, (tx) => {
    return productJson(recentMatchupsOf(tx, userId).map(({ shared, attacker, defender, at }) => ({ shared, attacker, defender, at })))
  }),
)

export const rememberMatchup = spacetime.reducer(
  { userId: t.string(), pairing: t.string(), shared: t.string(), attacker: t.string(), defender: t.string(), at: t.u64() },
  (ctx, input) => {
    requireOperator(ctx)
    rememberMatchupIn(ctx, [input.userId, input.pairing, input.shared, input.attacker, input.defender, input.at])
  },
)

export const forgetMatchup = spacetime.reducer({ userId: t.string(), pairing: t.string() }, (ctx, input) => {
  requireOperator(ctx)
  forgetMatchupIn(ctx, [input.userId, input.pairing])
})

export const abilityRemindersByUser = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  operatorTx(ctx, (tx) => {
    return productJson(
      Array.from(tx.db.abilityReminders.userId.filter(userId))
        .toSorted((left, right) => left.key.localeCompare(right.key))
        .map((row) => JSON.parse(row.reminder) as unknown),
    )
  }),
)

/** `full` changes nothing; replacing an alert the player already has never counts against the limit. */
export const saveAbilityReminder = spacetime.procedure({ userId: t.string(), payload: t.string(), at: t.u64() }, t.string(), (ctx, input) =>
  operatorTx(ctx, (tx) => saveAbilityReminderIn(tx, [input.userId, input.payload, input.at])),
)

export const deleteAbilityReminder = spacetime.reducer({ userId: t.string(), key: t.string() }, (ctx, input) => {
  requireOperator(ctx)
  deleteAbilityReminderIn(ctx, [input.userId, input.key])
})

function saveAbilityReminderIn(tx: Context, args: unknown[]) {
  const [userId, payload, at] = z.tuple([idInput, z.string().max(20_000), timestampArg]).parse(args)
  const reminder = decodePayload(abilityReminderSchema.strict(), payload, 'Invalid reminder')
  return productJson(writeAbilityReminder(tx, userId, reminder, at) ? 'saved' : 'full')
}

function deleteAbilityReminderIn(tx: Context, args: unknown[]) {
  const [userId, key] = z.tuple([idInput, z.string().max(240)]).parse(args)
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
  requireOperator(ctx)
  addFavouriteFactionIn(ctx, [input.userId, input.catalogueId, input.at])
})

export const removeFavouriteFaction = spacetime.reducer({ userId: t.string(), catalogueId: t.string() }, (ctx, input) => {
  requireOperator(ctx)
  removeFavouriteFactionIn(ctx, [input.userId, input.catalogueId])
})

export const unitLoadoutsByUser = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  operatorTx(ctx, (tx) => {
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
    operatorTx(ctx, (tx) => {
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
  operatorTx(ctx, (tx) => {
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
  operatorTx(ctx, (tx) => {
    if (tx.db.unitLoadouts.id.find(id)?.userId !== userId) return false
    tx.db.unitLoadouts.id.delete(id)
    touchProduct(tx, userId, 'rosters')
    return true
  }),
)

export const favouriteDetachmentsByUser = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  operatorTx(ctx, (tx) => {
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
    addFavouriteDetachmentIn(ctx, [input.userId, input.catalogueId, input.detachmentId, input.at])
  },
)

export const removeFavouriteDetachment = spacetime.reducer(
  { userId: t.string(), catalogueId: t.string(), detachmentId: t.string() },
  (ctx, input) => {
    requireOperator(ctx)
    removeFavouriteDetachmentIn(ctx, [input.userId, input.catalogueId, input.detachmentId])
  },
)

export const pushEnabled = spacetime.procedure({ userId: t.string() }, t.bool(), (ctx, { userId }) =>
  operatorTx(ctx, (tx) => {
    return tx.db.pushPreferences.userId.find(userId)?.enabled ?? DEFAULT_PUSH_NOTIFICATIONS
  }),
)

export const setPushEnabled = spacetime.procedure({ userId: t.string(), enabled: t.bool(), now: t.u64() }, t.bool(), (ctx, input) =>
  operatorTx(ctx, (tx) => setPushEnabledIn(tx, [input.userId, input.enabled, input.now])),
)

export const playerDefaults = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  operatorTx(ctx, (tx) => {
    const row = tx.db.playerDefaults.userId.find(userId)
    return productJson(row ? { rosterVisibility: row.rosterVisibility, battleSize: row.battleSize } : DEFAULT_PLAYER_DEFAULTS)
  }),
)

export const setPlayerDefaults = spacetime.procedure(
  { userId: t.string(), rosterVisibility: t.string(), battleSize: t.u32(), now: t.u64() },
  t.string(),
  (ctx, input) => operatorTx(ctx, (tx) => setPlayerDefaultsIn(tx, [input.userId, input.rosterVisibility, input.battleSize, input.now])),
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
    else {
      ctx.db.pushTokens.insert(row)
      recheckAchievements(ctx, input.userId, true)
    }
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
  if (row?.userId !== input.userId) return
  ctx.db.pushTokens.token.delete(input.token)
  recheckAchievements(ctx, input.userId, true)
})

export const deletePushTokens = spacetime.reducer({ tokens: t.array(t.string()) }, (ctx, { tokens }) => {
  requireOperator(ctx)
  if (tokens.length > 1_000) throw new SenderError('Too many push devices')
  for (const token of new Set(tokens)) {
    const row = ctx.db.pushTokens.token.find(token)
    if (!row) continue
    ctx.db.pushTokens.token.delete(token)
    recheckAchievements(ctx, row.userId, true)
  }
})

export const pushTargets = spacetime.procedure({ userIds: t.array(t.string()) }, t.string(), (ctx, { userIds }) =>
  operatorTx(ctx, (tx) => {
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
  operatorTx(ctx, (tx) => {
    if (tokens.length > 100) throw new SenderError('Too many league names')
    return productJson(
      [...new Set(tokens)].flatMap((token) => {
        const host = eventHost(tx, token)
        return host ? [[token, eventTitle(host)]] : []
      }),
    )
  }),
)

export const clubNames = spacetime.procedure({ tokens: t.array(t.string()) }, t.string(), (ctx, { tokens }) =>
  operatorTx(ctx, (tx) => {
    if (tokens.length > 100) throw new SenderError('Too many club names')
    return productJson(
      [...new Set(tokens)].flatMap((token) => {
        const club = tx.db.clubs.token.find(token)
        return club ? [[club.token, club.name]] : []
      }),
    )
  }),
)

/**
 * Leagues ran as standing groups, each a series of events. Each becomes a club with its people, and each of its events
 * one of the club's games; a league an earlier migration already tied to a club only moves its events. Every call
 * converts whatever leagues remain, so the server asks at each start and a second call finds none.
 */
export const migrateLeaguesToClubs = spacetime.procedure({ now: t.u64() }, t.u32(), (ctx, { now }) =>
  operatorTx(ctx, (tx) => {
    const leagues = Array.from(tx.db.leagues.iter())
    for (const league of leagues) {
      const clubId = league.clubId ?? league.id
      const adminIds = Array.from(tx.db.leagueAdmins.leagueId.filter(league.id), (row) => row.userId)
      const events = Array.from(tx.db.leagueEvents.leagueId.filter(league.id))
      if (!tx.db.clubs.id.find(clubId)) {
        tx.db.clubs.insert({
          id: clubId,
          token: league.token,
          ownerId: league.ownerId,
          name: league.name,
          description: league.description,
          visibility: league.visibility,
          admission: league.admission,
          createdAt: league.createdAt,
        })
        const people = new Set([league.ownerId, ...adminIds])
        for (const event of events)
          for (const entry of tx.db.leagueEventEntries.eventId.filter(event.id)) if (entry.status === 'accepted') people.add(entry.userId)
        for (const userId of people)
          tx.db.clubMembers.insert({
            key: JSON.stringify([clubId, userId]),
            clubId,
            userId,
            status: 'accepted',
            role: adminIds.includes(userId) && userId !== league.ownerId ? 'admin' : 'member',
            joinedAt: now,
          })
      }
      for (const event of events) {
        tx.db.sealedEvents.insert({
          id: event.id,
          token: event.token,
          format: event.format,
          rosterLimit: event.rosterLimit,
          allowances: event.allowances,
          rounds: event.rounds,
          pointsBudget: event.pointsBudget,
          playsAt: event.playsAt,
          sealBy: event.sealBy,
          createdAt: event.createdAt,
          revealedAt: event.revealedAt,
          revealedBy: event.revealedBy,
          soloPoints: undefined,
          allyPoints: undefined,
          remindedAt: undefined,
          sharedPoints: undefined,
        })
        tx.db.clubGames.insert({
          eventId: event.id,
          clubId,
          creatorId: league.ownerId,
          createdAt: event.createdAt,
          timeZone: undefined,
          supersededAt: undefined,
        })
        tx.db.leagueEvents.id.delete(event.id)
        touchEventById(tx, event.id)
      }
      for (const row of Array.from(tx.db.leagueAdmins.leagueId.filter(league.id))) tx.db.leagueAdmins.key.delete(row.key)
      tx.db.leagues.id.delete(league.id)
      touchClub(tx, clubId)
    }
    for (const club of tx.db.clubs.iter()) {
      const games = clubGameHosts(tx, club)
      let changed = false
      for (let index = 1; index < games.length; index++) {
        const { game } = games[index]!
        if (game.supersededAt !== undefined) continue
        tx.db.clubGames.eventId.update({ ...game, supersededAt: games[index - 1]!.game.createdAt })
        changed = true
      }
      if (changed) touchClub(tx, club.id)
    }
    return leagues.length
  }),
)

export const operatorHealth = spacetime.procedure({}, t.bool(), (ctx) => operatorTx(ctx, () => true))

/** Read by servers released before the leaderboard was stored; nothing reads it once none of them still serves. */
export const publicStandingsRevision = spacetime.procedure({}, t.string(), (ctx) =>
  operatorTx(ctx, (tx) => standingsRevision(tx).toString()),
)

function leagueEntriesFor(ctx: Context, eventId: string) {
  return Array.from(ctx.db.leagueEventEntries.eventId.filter(eventId)).sort(byJoined)
}

function droppedFrom(ctx: Context, eventId: string, userId: string) {
  return ctx.db.leagueEventEntries.key.find(JSON.stringify([eventId, userId]))?.droppedAt !== undefined
}

function roundPairings(ctx: Context, eventId: string) {
  return Array.from(ctx.db.leagueRoundPairings.eventId.filter(eventId)).sort((a, b) => a.round - b.round || a.table - b.table)
}

/** A bye is done as soon as it is paired; a table once its battle has ended or a player at it has dropped. */
function pairingFinished(ctx: Context, pairing: { eventId: string; aId: string; bId: string | undefined; battleId: string | undefined }) {
  if (pairing.bId === undefined || droppedFrom(ctx, pairing.eventId, pairing.aId) || droppedFrom(ctx, pairing.eventId, pairing.bId))
    return true
  if (pairing.battleId === undefined || !ctx.db.battles.id.find(pairing.battleId)) return false
  return battleState(ctx, pairing.battleId).state.status === 'finished'
}

/** A Swiss event is over once its final round is paired and every table has finished. */
function swissFinished(ctx: Context, event: SealedEventRow) {
  if (event.rounds === undefined) return false
  const pairings = roundPairings(ctx, event.id)
  return pairings.some((pairing) => pairing.round === event.rounds) && pairings.every((pairing) => pairingFinished(ctx, pairing))
}

/**
 * Whether an event is still on: a club game while it is open or a battle it started is still going, as its club page
 * shows it, and a Swiss tournament until it is over. Other tournaments have no end, so they stay on.
 */
function eventOn(ctx: Context, host: EventHost) {
  if (host.kind === 'tournament') return !swissFinished(ctx, host.event)
  if (!pastClubGame(ctx, host)) return true
  for (const row of ctx.db.leagueEventBattles.eventId.filter(host.event.id))
    if (ctx.db.battles.id.find(row.battleId) && battleState(ctx, row.battleId).state.status !== 'finished') return true
  return false
}

/** Who hosts an event, as every read names it: a tournament with its admins, or the club whose game it is. */
function hostFields(ctx: Context, host: EventHost) {
  return {
    kind: host.kind,
    token: hostToken(host),
    tournament: host.kind === 'tournament' ? { ...host.tournament, adminIds: tournamentAdminIds(ctx, host.tournament.id) } : null,
    club: host.kind === 'club' ? { token: host.club.token, name: host.club.name } : null,
    event: host.event,
  }
}

function eventRecord(ctx: Context, host: EventHost) {
  const { event } = host
  return {
    ...hostFields(ctx, host),
    organizerIds: hostOrganizerIds(ctx, host),
    entries: leagueEntriesFor(ctx, event.id),
    teams: Array.from(ctx.db.leagueEventTeams.eventId.filter(event.id), ({ teamId, disposition }) => ({ teamId, disposition })),
    teamWarlords: Array.from(ctx.db.leagueEventTeamWarlords.eventId.filter(event.id), ({ teamId, userId }) => ({ teamId, userId })),
    pairings: roundPairings(ctx, event.id).map((pairing) => pairingView(ctx, pairing)),
  }
}

function pairingView(ctx: Context, pairing: ReturnType<typeof roundPairings>[number]) {
  return {
    key: pairing.key,
    round: pairing.round,
    table: pairing.table,
    aId: pairing.aId,
    bId: pairing.bId ?? null,
    battleToken: pairing.battleId ? (ctx.db.battles.id.find(pairing.battleId)?.token ?? null) : null,
  }
}

export const leagueByToken = spacetime.procedure({ token: t.string(), eventToken: t.string() }, t.string(), (ctx, { token, eventToken }) =>
  operatorTx(ctx, (tx) => {
    if (token.length > MAX_ID_LENGTH || eventToken.length > MAX_ID_LENGTH) throw new SenderError('Invalid league token')
    const host = namedHost(tx, token, eventToken)
    return productJson(host ? eventRecord(tx, host) : null)
  }),
)

/**
 * Where an old link lands: the event its `?event=` names, a tournament, a club (once a league), or a club game by its
 * event's token, in that order.
 */
export const eventAddress = spacetime.procedure({ token: t.string(), eventToken: t.string() }, t.string(), (ctx, { token, eventToken }) =>
  operatorTx(ctx, (tx) => {
    if (token.length > MAX_ID_LENGTH || eventToken.length > MAX_ID_LENGTH) throw new SenderError('Invalid league token')
    const address = (host: EventHost | undefined) =>
      host?.kind === 'tournament'
        ? { kind: 'tournament', token: host.tournament.token }
        : host
          ? { kind: 'club-game', clubToken: host.club.token, token: host.event.token }
          : null
    const named = eventToken ? tx.db.sealedEvents.token.find(eventToken) : undefined
    if (named) return productJson(address(hostOfEvent(tx, named)))
    const tournament = tx.db.tournaments.token.find(token)
    if (tournament) return productJson({ kind: 'tournament', token })
    const club = tx.db.clubs.token.find(token)
    if (club) return productJson({ kind: 'club', clubToken: club.token })
    const event = tx.db.sealedEvents.token.find(token)
    return productJson(event ? address(hostOfEvent(tx, event)) : null)
  }),
)

/** Tournaments a player owns, helps run or entered, and the club games they entered or whose club they help run. */
function personalEventIds(ctx: Context, userId: string) {
  const ids = new Set<string>()
  for (const row of ctx.db.tournaments.ownerId.filter(userId)) ids.add(row.eventId)
  for (const row of ctx.db.tournamentAdmins.userId.filter(userId)) {
    const tournament = ctx.db.tournaments.id.find(row.tournamentId)
    if (tournament) ids.add(tournament.eventId)
  }
  for (const entry of ctx.db.leagueEventEntries.userId.filter(userId)) ids.add(entry.eventId)
  for (const member of ctx.db.clubMembers.userId.filter(userId)) {
    const club = ctx.db.clubs.id.find(member.clubId)
    if (club && isClubOrganizer(club, clubMemberRows(ctx, club), userId))
      for (const game of ctx.db.clubGames.clubId.filter(club.id)) ids.add(game.eventId)
  }
  return ids
}

/** When a battle's last command was written, or null while it is still being played. */
function finishedAt(ctx: Context, battleId: string) {
  const { log, state } = battleState(ctx, battleId)
  return state.status === 'finished' ? (log.at(-1)?.at ?? null) : null
}

/** Each club season fixture's finish, null while one is unplayed; a bye or a fixture a player withdrew from has none. */
function seasonFinishes(ctx: Context, seasonId: string, test: (pairing: { aId: string; bId: string | undefined }) => boolean) {
  const withdrawn = new Set(seasonPlayers(ctx, seasonId).flatMap((row) => (row.withdrawn ? [row.userId] : [])))
  return Array.from(ctx.db.leagueRoundPairings.eventId.filter(seasonId))
    .filter(test)
    .map((pairing) =>
      pairing.bId === undefined || withdrawn.has(pairing.aId) || withdrawn.has(pairing.bId)
        ? 0
        : pairing.battleId === undefined
          ? null
          : finishedAt(ctx, pairing.battleId),
    )
}

/** When every one of these finished, or null while any has not. */
const allFinished = (finishes: readonly (number | null)[]) =>
  finishes.length && finishes.every((at) => at !== null) ? Math.max(...(finishes as number[])) : null

/** Everything but battle results that `src/core/achievements.ts` reads for one player, each as the time it happened. */
export const achievementFactsByUser = spacetime.procedure({ userId: t.string() }, t.string(), (ctx, { userId }) =>
  operatorTx(ctx, (tx) => {
    if (!validId(userId)) throw new SenderError('Invalid user ID')
    const recruits = []
    for (const seat of tx.db.battleUsers.userId.filter(userId)) {
      // A copied battle's seats are claimed by whoever links the source account, so nobody was recruited there.
      if (seat.claimedSeat !== undefined || tx.db.battleImports.battleId.find(seat.battleId)) continue
      const claimants = Array.from(tx.db.battleUsers.battleId.filter(seat.battleId)).filter(
        (other) => other.userId !== userId && other.claimedSeat !== undefined,
      )
      const battle = claimants.length ? tx.db.battles.id.find(seat.battleId) : undefined
      const at = battle ? finishedAt(tx, seat.battleId) : null
      if (!battle || at === null) continue
      for (const other of claimants) recruits.push({ userId: other.userId, startedAt: safeNumber(battle.createdAt), at })
    }
    const tournaments = []
    for (const eventId of personalEventIds(tx, userId)) {
      const event = tx.db.sealedEvents.id.find(eventId)
      const host = event && hostOfEvent(tx, event)
      if (!event || host?.kind !== 'tournament' || !swissFinished(tx, event)) continue
      const pairings = roundPairings(tx, eventId)
      const entries = leagueEntriesFor(tx, eventId).filter((entry) => entry.status === 'accepted')
      const own = entries.find((entry) => entry.userId === userId)
      const ends = pairings.flatMap((pairing) => (pairing.battleId ? [finishedAt(tx, pairing.battleId) ?? 0] : []))
      tournaments.push({
        token: host.tournament.token,
        eventToken: event.token,
        entrants: entries.length,
        finishedAt: Math.max(safeNumber(event.revealedAt ?? event.createdAt), ...ends),
        organised: host.tournament.ownerId === userId || tournamentAdminIds(tx, host.tournament.id).includes(userId),
        played: own !== undefined && own.droppedAt === undefined,
      })
    }
    const clubs = Array.from(tx.db.clubs.ownerId.filter(userId), (club) => ({
      members: clubMembersOf(tx, club.id).flatMap((row) => (row.status === 'accepted' ? [safeNumber(row.joinedAt)] : [])),
      battles: Array.from(clubBattleIds(tx, club.id)).flatMap((battleId) => {
        const at = finishedAt(tx, battleId)
        return at === null ? [] : [at]
      }),
    }))
    const photos = Array.from(tx.db.collectionPhotos.userId.filter(userId))
      .filter((photo) => photo.review !== 'held')
      .map((photo) => ({
        at: safeNumber(photo.at),
        likes: Array.from(tx.db.collectionPhotoLikes.photoId.filter(photo.photoId)).flatMap((like) =>
          like.userId === userId ? [] : [safeNumber(like.at)],
        ),
      }))
    const seats = Array.from(tx.db.battleUsers.userId.filter(userId), (seat) => seat.battleId)
    const finishedSeats = (test: (battleId: string) => boolean) =>
      seats.flatMap((battleId) => {
        const at = test(battleId) ? finishedAt(tx, battleId) : null
        return at === null ? [] : [at]
      })
    const seasons = []
    const seasonsRun = []
    for (const member of tx.db.clubMembers.userId.filter(userId)) {
      const club = tx.db.clubs.id.find(member.clubId)
      const season = club && tx.db.clubSeasons.clubId.find(club.id)
      if (!club || season?.publishedAt === undefined || member.status !== 'accepted') continue
      const player = tx.db.clubSeasonPlayers.key.find(seasonPlayerKey(season.id, userId))
      const played =
        player &&
        !player.withdrawn &&
        allFinished(seasonFinishes(tx, season.id, (pairing) => pairing.aId === userId || pairing.bId === userId))
      if (played) seasons.push(played)
      const ran = isClubOrganizer(club, clubMemberRows(tx, club), userId) && allFinished(seasonFinishes(tx, season.id, () => true))
      if (ran) seasonsRun.push(ran)
    }
    const rosters = Array.from(tx.db.rosters.userId.filter(userId))
    const collection = Array.from(tx.db.collection.userId.filter(userId))
    return productJson({
      recruits,
      tournaments,
      clubs,
      photos,
      clubBattles: finishedSeats((battleId) => isClubBattle(tx, battleId)),
      imports: finishedSeats((battleId) => Boolean(tx.db.battleImports.battleId.find(battleId))),
      seasons,
      seasonsRun,
      seals: Array.from(tx.db.leagueEventEntries.userId.filter(userId)).flatMap((entry) =>
        entry.submittedAt === undefined ? [] : [safeNumber(entry.submittedAt)],
      ),
      published: rosters.flatMap((roster) => (roster.visibility === 'public' ? [safeNumber(roster.createdAt)] : [])),
      collected: collection.map((row) => safeNumber(row.at)),
      painted: collection.reduce((sum, row) => sum + (row.painted ?? 0), 0),
      wishes: Array.from(tx.db.collectionWishes.userId.filter(userId), (row) => safeNumber(row.at)),
      rosters: rosters.map((roster) => safeNumber(roster.createdAt)),
      loans: rosters.flatMap((roster) => Array.from(tx.db.rosterLoans.rosterId.filter(roster.id), (loan) => safeNumber(loan.lentAt))),
      friends: [...tx.db.friendships.requesterId.filter(userId), ...tx.db.friendships.addresseeId.filter(userId)].flatMap((row) =>
        row.acceptedAt === undefined ? [] : [safeNumber(row.acceptedAt)],
      ),
      likesGiven: Array.from(tx.db.collectionPhotoLikes.userId.filter(userId)).flatMap((like) =>
        tx.db.collectionPhotos.photoId.find(like.photoId)?.userId === userId ? [] : [safeNumber(like.at)],
      ),
      simulations: Array.from(tx.db.recentMatchups.userId.filter(userId), (row) => safeNumber(row.at)),
      reminders: Array.from(tx.db.abilityReminders.userId.filter(userId), (row) => safeNumber(row.updatedAt)),
      loadouts: Array.from(tx.db.unitLoadouts.userId.filter(userId), (row) => safeNumber(row.createdAt)),
      favourites: [
        ...tx.db.favouriteFactions.userId.filter(userId),
        ...tx.db.favouriteDetachments.userId.filter(userId),
        ...tx.db.favouriteDatasheets.userId.filter(userId),
      ].map((row) => safeNumber(row.at)),
      app: Array.from(tx.db.pushTokens.userId.filter(userId), (row) => safeNumber(row.createdAt)),
    })
  }),
)

/** Public tournaments and every event of a player's own, their own first, then newest. */
export const leaguesVisibleTo = spacetime.procedure({ userId: t.string(), limit: t.u32() }, t.string(), (ctx, { userId, limit }) =>
  operatorTx(ctx, (tx) => {
    if (userId.length > MAX_ID_LENGTH || limit < 1 || limit > 100) throw new SenderError('Invalid league list')
    const personal = userId ? personalEventIds(tx, userId) : new Set<string>()
    const hosts: EventHost[] = []
    let scanned = 0
    for (const tournament of tx.db.tournaments.iter()) {
      if (++scanned > 100_000) throw new SenderError('League list is too large')
      if (tournament.visibility !== 'public' && !personal.has(tournament.eventId)) continue
      const event = tx.db.sealedEvents.id.find(tournament.eventId)
      if (event) hosts.push({ kind: 'tournament', tournament, event })
    }
    for (const eventId of personal) {
      const event = tx.db.sealedEvents.id.find(eventId)
      const host = event && hostOfEvent(tx, event)
      if (host?.kind === 'club') hosts.push(host)
    }
    hosts.sort(
      (a, b) => Number(personal.has(b.event.id)) - Number(personal.has(a.event.id)) || Number(b.event.createdAt - a.event.createdAt),
    )
    return productJson(
      hosts.slice(0, limit).map((host) => {
        const entries = leagueEntriesFor(tx, host.event.id)
        return {
          ...hostFields(tx, host),
          personal: personal.has(host.event.id),
          joined: entries.length,
          accepted: entries.filter((entry) => entry.status === 'accepted').length,
          occupied: entries.filter((entry) => entry.status !== 'rejected').length,
          ownEntry: entries.find((entry) => entry.userId === userId) ?? null,
        }
      }),
    )
  }),
)

export const outdatedLeagueEntriesForRoster = spacetime.procedure(
  { userId: t.string(), rosterId: t.string() },
  t.string(),
  (ctx, { userId, rosterId }) =>
    operatorTx(ctx, (tx) => {
      if (!validId(userId) || !validId(rosterId)) throw new SenderError('Invalid roster lookup')
      const saved = ownedRoster(tx, rosterId, userId)
      if (!saved) return productJson([])
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
        const event = tx.db.sealedEvents.id.find(entry.eventId)
        if (!event || event.revealedAt !== undefined) continue
        const sealed = rosterSnapshotOrNull(entry.rosterSnapshot)
        if (sealed && matchesSealedLeagueRoster(current, sealed)) continue
        const host = hostOfEvent(tx, event)
        if (host)
          matches.push({ token: hostToken(host), name: eventTitle(host), club: host.kind === 'club' ? { token: host.club.token } : null })
      }
      return productJson(matches)
    }),
)

/** Whether a reader may find an event in lists: a public tournament or club, or one of their own. */
function listsEvent(ctx: Context, host: EventHost, readerId: string, personal: ReadonlySet<string>) {
  if (personal.has(host.event.id)) return true
  if (host.kind === 'tournament') return host.tournament.visibility === 'public'
  return host.club.visibility === 'public' || isClubMember(ctx, host.club.id, readerId)
}

/** Friends' sealed lists from revealed events the viewer can list and that are still on, newest reveal first. */
export const friendLeagueRosters = spacetime.procedure({ viewerId: t.string() }, t.string(), (ctx, { viewerId }) =>
  operatorTx(ctx, (tx) => {
    if (!validId(viewerId)) throw new SenderError('Invalid league roster list')
    const personal = personalEventIds(tx, viewerId)
    const on = new Map<string, boolean>()
    const rosters = []
    let scanned = 0
    for (const friendId of acceptedFriendIds(tx, viewerId)) {
      for (const entry of tx.db.leagueEventEntries.userId.filter(friendId)) {
        if (++scanned > 10_000) throw new SenderError('Too many league entries')
        if (entry.status !== 'accepted' || entry.rosterSnapshot === undefined) continue
        const event = tx.db.sealedEvents.id.find(entry.eventId)
        if (!event || event.revealedAt === undefined) continue
        const host = hostOfEvent(tx, event)
        if (!host || !listsEvent(tx, host, viewerId, personal)) continue
        if (!on.has(event.id)) on.set(event.id, eventOn(tx, host))
        if (!on.get(event.id)) continue
        const catalogueId = rosterSnapshotOrNull(entry.rosterSnapshot)?.built?.catalogueId
        if (!catalogueId) continue
        rosters.push({
          leagueToken: hostToken(host),
          leagueName: eventTitle(host),
          eventToken: event.token,
          userId: friendId,
          rosterName: entry.rosterName ?? '',
          catalogueId,
          revealedAt: event.revealedAt,
        })
      }
    }
    rosters.sort((a, b) => Number(b.revealedAt - a.revealedAt))
    return productJson(rosters.slice(0, 50))
  }),
)

export const leagueBattleCandidates = spacetime.procedure(
  { userId: t.string(), participantIds: t.array(t.string()) },
  t.string(),
  (ctx, { userId, participantIds }) =>
    operatorTx(ctx, (tx) => {
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
        const event = tx.db.sealedEvents.id.find(own.eventId)
        if (!event || event.revealedAt === undefined) continue
        const host = hostOfEvent(tx, event)
        if (!host) continue
        const participants = leagueEntriesFor(tx, event.id).filter(
          (entry) => participantIds.includes(entry.userId) && entry.status === 'accepted' && entry.rosterSnapshot !== undefined,
        )
        if (participants.length !== participantIds.length) continue
        candidates.push({ token: hostToken(host), name: eventTitle(host), event, entries: participants })
      }
      candidates.sort((a, b) => Number(b.event.revealedAt! - a.event.revealedAt!))
      return productJson(candidates.slice(0, 50))
    }),
)

export const leagueRosters = spacetime.procedure(
  { token: t.string(), userId: t.string(), eventToken: t.string(), readerId: t.string() },
  t.string(),
  (ctx, { token, userId, eventToken, readerId }) =>
    operatorTx(ctx, (tx) => {
      const event = namedHost(tx, token, eventToken)?.event
      const entry = event && tx.db.leagueEventEntries.key.find(JSON.stringify([event.id, userId]))
      if (!entry || entry.status !== 'accepted' || entry.rosterSnapshot === undefined) return 'null'
      const reader = readerId ? tx.db.leagueEventEntries.key.find(JSON.stringify([event.id, readerId])) : undefined
      return productJson({ event, entry, reader: reader ?? null })
    }),
)

type LeagueEntryRow = NonNullable<ReturnType<Context['db']['leagueEventEntries']['key']['find']>>

function leagueRosterSharingState(tx: Context, event: SealedEventRow, userId: string) {
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
    operatorTx(ctx, (tx) => {
      const event = namedHost(tx, token, eventToken)?.event
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

/** The fields an entry's sealed list fills, all cleared. */
const UNSEALED = { rosterId: undefined, rosterName: undefined, rosterSnapshot: undefined, submittedAt: undefined }

function insertLeagueEntry(ctx: Context, eventId: string, userId: string, status: 'accepted' | 'pending', now: number) {
  ctx.db.leagueEventEntries.insert({
    key: JSON.stringify([eventId, userId]),
    eventId,
    userId,
    status,
    joinedAt: BigInt(now),
    ...UNSEALED,
    requiredLimit: undefined,
    teamId: undefined,
    droppedAt: undefined,
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
const leagueRosterLimitInput = z.number().int().positive().max(10_000)
const leagueMemberLimitInput = z.number().int().min(LEAGUE_MEMBER_MIN).max(LEAGUE_MEMBER_MAX)
const leagueFormatInput = z.enum(TABLE_SHAPES)
const leagueRoundsInput = z.number().int().min(1).max(SWISS_ROUNDS_MAX).nullable()
const leaguePointsBudgetInput = z.number().int().min(POINTS_BUDGET_MIN).max(POINTS_BUDGET_MAX).nullable()
const leagueScheduleInput = z.object({ playsAt: leagueTimeInput.nullable(), sealBy: leagueTimeInput.nullable() })

/** A duel's own points total, or none when it matches the battle size or the format takes no override. */
function leaguePointsBudget(format: string | null, rosterLimit: number | null, budget: number | null) {
  if (budget === null || rosterLimit === null || budget === rosterLimit) return { budget: undefined }
  if (format !== '1v1' || pointsBudgetError(rosterLimit, budget)) return null
  return { budget }
}
const leagueArmyPointsInput = z.number().int().min(1).max(POINTS_BUDGET_MAX).nullable()
const leagueRuleInput = z.object({
  format: leagueFormatInput,
  rosterLimit: leagueRosterLimitInput,
  allowances: leagueAllowancesSchema.optional(),
  // Absent from an older client, which leaves the event's pairing and points as they stand.
  rounds: leagueRoundsInput.optional(),
  pointsBudget: leaguePointsBudgetInput.optional(),
  soloPoints: leagueArmyPointsInput.optional(),
  allyPoints: leagueArmyPointsInput.optional(),
  sharedPoints: z.boolean().optional(),
})

/** An event's format, size and points per army, as the league rules read them. */
const eventPoints = (event: SealedEventRow) => ({
  format: (event.format ?? null) as TableShape | null,
  rosterLimit: event.rosterLimit ?? null,
  soloPoints: event.soloPoints ?? null,
  allyPoints: event.allyPoints ?? null,
  sharedPoints: event.sharedPoints ?? false,
})

type SealedBuilt = NonNullable<Roster['built']>

/** Why a sealed list cannot take its team seat; a pair that shares points reads it beside the partner's sealed list. */
function teamSeatRefusal(event: SealedEventRow, entry: LeagueEntryRow, built: SealedBuilt, partner: SealedBuilt | null) {
  const seat = { requiredLimit: entry.requiredLimit ?? null, teamId: entry.teamId ?? null }
  const points = leagueEntryPoints(eventPoints(event), seat)
  if (points === null) return { refusal: 'wrong-limit' as const, points: null }
  const pair = leagueSharesPoints(eventPoints(event), seat) ? { partner } : undefined
  const refusal = leagueSeatRefusal(built, event.rosterLimit!, points, pair)
  // What the list may spend: its seat's points, or what its pair has left beside the partner's list.
  return { refusal, points: pair ? points * 2 - (partner ? pointsSpent(partner) : 0) : points }
}

/** The sealed list of an entrant's partner in a fixed pair, or null before it has one. */
function partnerBuilt(entries: readonly LeagueEntryRow[], entry: LeagueEntryRow) {
  if (entry.teamId === undefined) return null
  const partner = entries.find(
    (row) => row.userId !== entry.userId && row.teamId === entry.teamId && row.status === 'accepted' && row.rosterSnapshot !== undefined,
  )
  return rosterSnapshotOrNull(partner?.rosterSnapshot)?.built ?? null
}

/** Whether every sealed list still meets the event's allowances and, once seated at a team event, its points. */
function sealedListsFit(event: SealedEventRow, entries: readonly LeagueEntryRow[]) {
  const allowances = leagueEventAllowances(event)
  return entries.every((entry) => {
    if (entry.status !== 'accepted' || entry.rosterSnapshot === undefined) return true
    const sealed = rosterSnapshotOrNull(entry.rosterSnapshot)
    if (!sealed?.built || leagueAllowanceRefusal(sealed, allowances)) return false
    if (!leagueWarlordWaived(sealed, allowances) && !leagueWarlordValid(sealed)) return false
    const seat = { requiredLimit: entry.requiredLimit ?? null, teamId: entry.teamId ?? null }
    if (leagueEntryPoints(eventPoints(event), seat) === null) return true
    return teamSeatRefusal(event, entry, sealed.built, partnerBuilt(entries, entry)).refusal === null
  })
}

/** Null for an event created before allowances were recorded. */
const leagueEventAllowances = (event: SealedEventRow) => (event.allowances === undefined ? null : parseLeagueAllowances(event.allowances))
/** A tournament's own details; a club game has none. */
const leagueDetailsInput = z.object({
  name: z.string().max(100),
  description: z.string().max(2_000),
  visibility: z.enum(LEAGUE_VISIBILITIES),
  admission: z.enum(LEAGUE_ADMISSIONS),
  playerLimit: leagueMemberLimitInput.nullable(),
})

/** Opens every sealed list of an unrevealed event for `actorId`, or says why it cannot, checking the rosters themselves beyond the checklist. */
function revealLeagueEvent(tx: Context, event: SealedEventRow, now: number, actorId: string) {
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
      const format = event.format as TableShape
      const required = requiredLeagueRosterLimit(format, event.rosterLimit ?? null, entry.requiredLimit ?? null, entry.teamId ?? null)
      const built = snapshots[index]!.built
      if (required === null || !built) return true
      if (format === '1v1') return built.limit !== required
      return teamSeatRefusal(event, entry, built, partnerBuilt(entries, entry)).refusal !== null
    })
  )
    return { outcome: 'not-ready' as const }
  for (const entry of all.filter((row) => row.status === 'pending')) tx.db.leagueEventEntries.key.update({ ...entry, status: 'rejected' })
  // Recorded outright, so the card a pair agreed on by default survives one of its lists being unsealed.
  for (const team of eventTeams(tx, event.id, all)) {
    if (team.disposition) setTeamPick(tx, event.id, team.id, team.disposition)
    if (team.warlord) setTeamWarlord(tx, event.id, team.id, team.warlord)
  }
  tx.db.sealedEvents.id.update({ ...event, revealedAt: BigInt(now), revealedBy: actorId })
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
      roster: entry.teamId ? rosterSnapshotOrNull(entry.rosterSnapshot) : null,
    })),
    picks,
    warlords,
  )
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
  operatorTx(ctx, (tx) => leagueCommandIn(tx, [payload])),
)

const clubDetailsInput = z.object({
  name: z.string().min(1).max(CLUB_NAME_MAX_LENGTH),
  description: z.string().max(CLUB_DESCRIPTION_MAX_LENGTH),
  visibility: z.enum(LEAGUE_VISIBILITIES),
  admission: z.enum(LEAGUE_ADMISSIONS),
})

const seasonSeed = z.number().int().min(0).max(CLUB_SEASON_SEED_MAX)

const clubCommandInput = z.discriminatedUnion('op', [
  clubDetailsInput.extend({ op: z.literal('create'), id: idInput, token: idInput, ownerId: idInput, now: leagueTimeInput }),
  clubDetailsInput.extend({ op: z.literal('update'), token: idInput, actorId: idInput }),
  z.object({ op: z.literal('delete'), token: idInput, actorId: idInput }),
  z.object({ op: z.literal('join'), token: idInput, userId: idInput, now: leagueTimeInput }),
  z.object({ op: z.literal('leave'), token: idInput, userId: idInput }),
  z.object({ op: z.literal('moderate'), token: idInput, actorId: idInput, userId: idInput, accept: z.boolean() }),
  z.object({ op: z.literal('remove'), token: idInput, actorId: idInput, userId: idInput }),
  z.object({ op: z.literal('set-admins'), token: idInput, actorId: idInput, userIds: z.array(idInput).max(CLUB_ADMIN_MAX) }),
  z.object({ op: z.literal('season-join'), token: idInput, userId: idInput, now: leagueTimeInput }),
  z.object({ op: z.literal('season-leave'), token: idInput, userId: idInput }),
  z.object({ op: z.literal('season-draw'), token: idInput, actorId: idInput, seasonId: idInput, seed: seasonSeed, now: leagueTimeInput }),
  z.object({
    op: z.literal('season-publish'),
    token: idInput,
    actorId: idInput,
    seed: seasonSeed,
    playerIds: z.array(idInput).max(CLUB_SEASON_PLAYERS_MAX),
    now: leagueTimeInput,
  }),
  z.object({
    op: z.literal('season-deadline'),
    token: idInput,
    actorId: idInput,
    round: z.number().int().min(1).max(CLUB_SEASON_PLAYERS_MAX),
    deadline: leagueTimeInput.nullable(),
  }),
  z.object({ op: z.literal('season-delete'), token: idInput, actorId: idInput }),
])

function clubMembersOf(ctx: Context, clubId: string) {
  return Array.from(ctx.db.clubMembers.clubId.filter(clubId)).sort(byJoined)
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
    leaveSeason(tx, club.id, input.userId)
    return productJson('left')
  }
  const season = tx.db.clubSeasons.clubId.find(club.id)
  if (input.op === 'season-join') {
    if (!season) return productJson('missing')
    // Players joining after publication sit this season out.
    if (season.publishedAt !== undefined) return productJson('published')
    if (!isClubMember(tx, club.id, input.userId)) return productJson('forbidden')
    const key = seasonPlayerKey(season.id, input.userId)
    if (tx.db.clubSeasonPlayers.key.find(key)) return productJson('joined')
    if (seasonPlayers(tx, season.id).length >= CLUB_SEASON_PLAYERS_MAX) return productJson('full')
    tx.db.clubSeasonPlayers.insert({ key, seasonId: season.id, userId: input.userId, joinedAt: BigInt(input.now), withdrawn: false })
    touchClub(tx, club.id)
    return productJson('joined')
  }
  if (input.op === 'season-leave') {
    if (!leaveSeason(tx, club.id, input.userId)) return productJson('missing')
    touchClub(tx, club.id)
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
    deleteClub(tx, club)
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
    leaveSeason(tx, club.id, input.userId)
    return productJson('removed')
  }
  if (input.op === 'season-draw') {
    // A published draw is fixed, so no fixture already played is ever drawn again.
    if (season?.publishedAt !== undefined) return productJson('published')
    if (season) tx.db.clubSeasons.id.update({ ...season, seed: input.seed })
    else
      tx.db.clubSeasons.insert({
        id: input.seasonId,
        clubId: club.id,
        seed: input.seed,
        createdAt: BigInt(input.now),
        publishedAt: undefined,
        deadlines: undefined,
      })
    touchClub(tx, club.id)
    return productJson('drawn')
  }
  if (input.op === 'season-publish') {
    if (!season) return productJson('missing')
    if (season.publishedAt !== undefined) return productJson('published')
    const players = seasonPlayers(tx, season.id).map((row) => row.userId)
    // What is published is the draw the organizer reviewed, not one a later join or redraw changed.
    if (input.seed !== season.seed || JSON.stringify(players.toSorted()) !== JSON.stringify(input.playerIds.toSorted()))
      return productJson('stale')
    if (players.length < CLUB_SEASON_PLAYERS_MIN) return productJson('too-few')
    for (const [index, tables] of seasonDraw(players, season.seed).entries())
      for (const [at, [aId, bId]] of tables.entries())
        tx.db.leagueRoundPairings.insert({
          key: JSON.stringify([season.id, index + 1, at + 1]),
          eventId: season.id,
          round: index + 1,
          table: at + 1,
          aId,
          bId: bId ?? undefined,
          battleId: undefined,
        })
    tx.db.clubSeasons.id.update({ ...season, publishedAt: BigInt(input.now) })
    touchClub(tx, club.id)
    return productJson('published')
  }
  if (input.op === 'season-deadline') {
    if (season?.publishedAt === undefined) return productJson('missing')
    const rounds = Math.max(0, ...roundPairings(tx, season.id).map((pairing) => pairing.round))
    if (input.round > rounds) return productJson('missing')
    const saved = seasonDeadlines(season)
    const deadlines = Array.from({ length: rounds }, (_, index) => saved[index] ?? null)
    deadlines[input.round - 1] = input.deadline
    tx.db.clubSeasons.id.update({ ...season, deadlines: JSON.stringify(deadlines) })
    touchClub(tx, club.id)
    return productJson('set')
  }
  if (input.op === 'season-delete') {
    if (!season) return productJson('missing')
    deleteSeason(tx, season)
    touchClub(tx, club.id)
    return productJson('deleted')
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
  operatorTx(ctx, (tx) => clubCommandIn(tx, [payload])),
)

export const clubByToken = spacetime.procedure({ token: t.string() }, t.string(), (ctx, { token }) =>
  operatorTx(ctx, (tx) => {
    if (token.length > MAX_ID_LENGTH) throw new SenderError('Invalid club token')
    const club = tx.db.clubs.token.find(token)
    if (!club) return productJson(null)
    return productJson({
      club,
      members: clubMemberRows(tx, club),
      games: clubGameHosts(tx, club).map((host) => {
        const { event } = host
        return {
          token: event.token,
          createdAt: event.createdAt,
          pastAt: gamePastAt(host),
          revealedAt: event.revealedAt ?? null,
          playsAt: event.playsAt ?? null,
          sealBy: event.sealBy ?? null,
          format: event.format ?? null,
          rosterLimit: event.rosterLimit ?? null,
          pointsBudget: event.pointsBudget ?? null,
          soloPoints: event.soloPoints ?? null,
          allyPoints: event.allyPoints ?? null,
          sharedPoints: event.sharedPoints ?? false,
          players: leagueEntriesFor(tx, event.id)
            .filter((entry) => entry.status === 'accepted')
            .map((entry) => ({
              userId: entry.userId,
              sealed: entry.rosterSnapshot !== undefined,
              teamId: entry.teamId ?? null,
              requiredLimit: entry.requiredLimit ?? null,
            })),
          played: playedPairs(tx, event.id),
          battles: Array.from(tx.db.leagueEventBattles.eventId.filter(event.id)).length,
          playing: unfinishedPlayers(tx, event.id),
        }
      }),
      season: seasonRecord(tx, club.id),
    })
  }),
)

/** The seat a side of a club's team game names. */
function clubGameSeat(format: string | undefined, rosterLimit: number | undefined, side: (typeof CLUB_GAME_SIDES)[number]) {
  if (rosterLimit === undefined) return null
  const allied = alliedLeagueRosterLimit(rosterLimit)
  if (format === '2v1' && side === 'solo') return { teamId: undefined, requiredLimit: rosterLimit, places: 1 }
  if (format === '2v1' && side === 'pair') return { teamId: 'pair', requiredLimit: allied, places: 2 }
  if (format === '2v2' && (side === 'team-1' || side === 'team-2')) return { teamId: side, requiredLimit: allied, places: 2 }
  return null
}

/** Everyone seated at one of an event's battles that has not ended yet. */
function unfinishedPlayers(ctx: Context, eventId: string) {
  const players = new Set<string>()
  for (const row of ctx.db.leagueEventBattles.eventId.filter(eventId)) {
    if (!ctx.db.battles.id.find(row.battleId)) continue
    const { seats, state } = battleState(ctx, row.battleId)
    if (state.status !== 'finished') for (const seat of seats) players.add(seat.id)
  }
  return [...players]
}

/** Which entrants have already started a battle against each other in an event, as sorted id pairs. */
function playedPairs(ctx: Context, eventId: string) {
  const pairs = new Set<string>()
  for (const row of ctx.db.leagueEventBattles.eventId.filter(eventId)) {
    const seats = Array.from(ctx.db.battleUsers.battleId.filter(row.battleId))
    for (const one of seats)
      for (const other of seats)
        if (one.side !== other.side && one.userId < other.userId) pairs.add(JSON.stringify([one.userId, other.userId]))
  }
  return [...pairs].map((pair) => JSON.parse(pair) as [string, string])
}

/** Public clubs and every club a player owns, belongs to, or has asked to join, their own first. */
export const clubsVisibleTo = spacetime.procedure({ userId: t.string(), limit: t.u32() }, t.string(), (ctx, { userId, limit }) =>
  operatorTx(ctx, (tx) => {
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
          ...clubActivity(tx, club.id),
          ownMember: ownMember ? { status: ownMember.status, role: ownMember.role } : null,
        }
      }),
    )
  }),
)

/** The club a battle counts for, and the clubs it could, for its setup. */
export const battleClubs = spacetime.procedure({ battleId: t.string() }, t.string(), (ctx, { battleId }) =>
  operatorTx(ctx, (tx) => {
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

type BattleSeat = { id: string; side: number; guestName?: string }

/** Seats a new battle and writes its opening commands, each refused against the state those before it leave. */
function insertBattle(
  ctx: Context,
  { id, token, now, by, seats }: { id: string; token: string; now: number; by: string; seats: readonly BattleSeat[] },
  initialCommands: readonly Command[],
  refusal: (state: BattleState, command: Command) => string | null,
  times: readonly number[] = [],
) {
  ctx.db.battles.insert({ id, token, createdAt: BigInt(now) })
  for (const [index, seat] of seats.entries()) {
    ctx.db.battleUsers.insert({
      key: JSON.stringify([id, seat.id]),
      battleId: id,
      userId: seat.id,
      side: seat.side,
      joinedAt: BigInt(now + index),
      guestName: seat.guestName,
      claimedSeat: undefined,
    })
    touchProduct(ctx, seat.id, 'battles', 'onboarding')
  }
  touchBattle(ctx, id)
  // A copied battle arrives finished, so it can change the leaderboard.
  if (initialCommands.length) touchPublic(ctx, 'standings')
  touchAdmin(ctx)
  const log: LoggedCommand[] = []
  for (const [index, command] of initialCommands.entries()) {
    const refused = refusal(
      reduceBattle(
        seats.map((seat) => seat.id),
        log,
        seats.map((seat) => seat.side),
      ),
      command,
    )
    if (refused) throw new SenderError(`new battle command was refused: ${refused}`)
    const seq = index + 1
    const at = Math.max(now, times[index] ?? now, log.at(-1)?.at ?? now)
    ctx.db.commands.insert({
      key: JSON.stringify([id, seq]),
      battleId: id,
      seq,
      userId: by,
      at: BigInt(at),
      body: JSON.stringify(command),
    })
    log.push({ seq, by, at, command })
  }
}

function createBattleIn(tx: Context, args: unknown[]) {
  const [payload] = z.tuple([textArg]).parse(args)
  const battle = decodePayload(newBattle, payload, 'Invalid battle')
  const { id, token, userId, allyIds, opponentIds, guestNames, initialCommands, now, imported } = battle
  const seats: BattleSeat[] = [
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
  if (imported) {
    const [importer, opponent] = imported.players.map((player) => externalPlayerKey(imported.source, player))
    if (
      seats.length !== 2 ||
      !guestNames.length ||
      battle.fixtureKey !== undefined ||
      imported.times.length !== initialCommands.length ||
      tx.db.externalAccounts.key.find(importer!)?.userId !== userId
    )
      throw new SenderError('Invalid imported battle')
    const key = JSON.stringify([imported.source, imported.sourceId])
    if (tx.db.battleImports.key.find(key)) throw new SenderError('Battle already imported')
    insertBattle(
      tx,
      { id, token, now, by: userId, seats },
      initialCommands,
      (state, command) => importedCommandRefusal(state, userId, command),
      imported.times,
    )
    tx.db.battleImports.insert({ battleId: id, key })
    for (const [at, player] of [importer!, opponent!].entries())
      tx.db.importedSeats.insert({ key: JSON.stringify([id, seats[at]!.id]), battleId: id, player })
    // An opponent who proved the source account is theirs plays their own seat from the start.
    const linked = tx.db.externalAccounts.key.find(opponent!)?.userId
    if (linked && linked !== userId) seatExternalPlayer(tx, opponent!, linked, id)
    return productJson(battleData(tx, id))
  }
  // A club game started from its club is tagged at birth, for players who all belong to it.
  insertBattle(
    tx,
    { id, token, now, by: userId, seats },
    initialCommands,
    (state, command) =>
      validate(state, userId, command) ??
      (command.kind === 'set-battle-club' && command.clubId && !battleClubIds(tx, battleData(tx, id).seats).includes(command.clubId)
        ? CLUB_MEMBERS_ONLY
        : null),
  )
  if (initialCommands.some((command) => command.kind === 'set-battle-club')) indexClubBattle(tx, id)
  if (battle.fixtureKey !== undefined) {
    const { fixture, season } = openFixture(tx, battle.fixtureKey, battle)
    tx.db.leagueRoundPairings.key.update({ ...fixture, battleId: id })
    tx.db.leagueEventBattles.insert({ battleId: id, eventId: season.id })
    touchClub(tx, season.clubId)
  }
  return productJson(battleData(tx, id))
}

function removeBattleIn(tx: Context, args: unknown[]) {
  const [battleId, userId] = z.tuple([textArg, textArg]).parse(args)
  const opener = Array.from(tx.db.battleUsers.battleId.filter(battleId))
    .filter((seat) => seat.side === 0)
    .sort((left, right) => (left.joinedAt > right.joinedAt ? 1 : left.joinedAt < right.joinedAt ? -1 : 0))[0]
  if (!opener || opener.userId !== userId) return false
  deleteBattle(tx, battleId)
  return true
}

function requestFriendIn(tx: Context, args: unknown[]) {
  const [requesterId, addresseeId, now] = z.tuple([textArg, textArg, timestampArg]).parse(args)
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
  const current = tx.db.friendships.key.find(friendshipKey(requesterId, addresseeId))
  if (!current || current.acceptedAt !== undefined) return false
  tx.db.friendships.key.update({ ...current, acceptedAt: now })
  touchFriends(tx, requesterId, addresseeId)
  return true
}

function rejectFriendIn(tx: Context, args: unknown[]) {
  const [requesterId, addresseeId] = z.tuple([textArg, textArg]).parse(args)
  const current = tx.db.friendships.key.find(friendshipKey(requesterId, addresseeId))
  if (!current || current.requesterId !== requesterId || current.addresseeId !== addresseeId || current.acceptedAt !== undefined)
    return false
  const deleted = tx.db.friendships.key.delete(current.key)
  if (deleted) touchFriends(tx, requesterId, addresseeId)
  return deleted
}

function removeFriendIn(tx: Context, args: unknown[]) {
  const [leftId, rightId] = z.tuple([textArg, textArg]).parse(args)
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
  if (!validId(inviterId) || !validId(token)) throw new SenderError('Invalid invite')
  const current = ctx.db.friendInvites.inviterId.find(inviterId)
  if (current) ctx.db.friendInvites.token.delete(current.token)
  ctx.db.friendInvites.insert({ inviterId, token, createdAt: now })
  touchProduct(ctx, inviterId, 'invites')
  touchPublic(ctx, 'invites')
}

function cancelFriendInviteIn(tx: Context, args: unknown[]) {
  const [inviterId] = z.tuple([textArg]).parse(args)
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
  moveHeartsToFavourites(ctx, userId)
  const key = JSON.stringify([userId, entryId])
  if (!ctx.db.collection.key.find(key)) {
    ctx.db.collection.insert({ key, userId, entryId, at, models: 1, built: undefined, painted: undefined, countsAs: undefined })
    touchCollection(ctx, userId)
  }
}

function removeFromCollectionIn(ctx: Context, args: unknown[]) {
  const [userId, entryId] = z.tuple([textArg, textArg]).parse(args)
  moveHeartsToFavourites(ctx, userId)
  const key = JSON.stringify([userId, entryId])
  dropCollectionRowPhotos(ctx, key)
  if (ctx.db.collection.key.delete(key)) touchCollection(ctx, userId)
}

function setCollectionModelsIn(ctx: Context, args: unknown[]) {
  const [userId, entryId, models, at] = z
    .tuple([textArg, textArg, z.number().int().min(1).max(MAX_COLLECTION_MODELS), timestampArg])
    .parse(args)
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
  moveHeartsToFavourites(ctx, userId)
  const current = ctx.db.collection.key.find(JSON.stringify([userId, entryId]))
  if (!current) throw new SenderError('Add this datasheet to your collection before counting built or painted models')
  ctx.db.collection.key.update({ ...current, ...boundedProgress(current.models ?? 1, { built, painted }) })
  touchCollection(ctx, userId)
}

function setCollectionCountsAsIn(ctx: Context, args: unknown[]) {
  const [userId, entryId, countsAs] = z.tuple([textArg, textArg, z.array(countsAsId).max(MAX_COUNTS_AS)]).parse(args)
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
  const key = JSON.stringify([userId, catalogueId])
  if (!ctx.db.favouriteFactions.key.find(key)) {
    ctx.db.favouriteFactions.insert({ key, userId, catalogueId, at })
    touchProduct(ctx, userId, 'favourites')
  }
}

function removeFavouriteFactionIn(ctx: Context, args: unknown[]) {
  const [userId, catalogueId] = z.tuple([textArg, textArg]).parse(args)
  if (ctx.db.favouriteFactions.key.delete(JSON.stringify([userId, catalogueId]))) touchProduct(ctx, userId, 'favourites')
}

function addFavouriteDatasheetIn(ctx: Context, args: unknown[]) {
  const [userId, entryId, at] = z.tuple([textArg, textArg, timestampArg]).parse(args)
  const key = JSON.stringify([userId, entryId])
  if (!ctx.db.favouriteDatasheets.key.find(key)) {
    ctx.db.favouriteDatasheets.insert({ key, userId, entryId, at })
    touchProduct(ctx, userId, 'favourites')
  }
}

function removeFavouriteDatasheetIn(ctx: Context, args: unknown[]) {
  const [userId, entryId] = z.tuple([textArg, textArg]).parse(args)
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
  const key = JSON.stringify([userId, pairing])
  const row = { key, userId, shared, attacker, defender, at }
  if (ctx.db.recentMatchups.key.find(key)) ctx.db.recentMatchups.key.update(row)
  else ctx.db.recentMatchups.insert(row)
  for (const old of recentMatchupsOf(ctx, userId).slice(RECENT_MATCHUP_LIMIT)) ctx.db.recentMatchups.key.delete(old.key)
  touchProduct(ctx, userId, 'simulator')
}

function forgetMatchupIn(ctx: Context, args: unknown[]) {
  const [userId, pairing] = z.tuple([idInput, matchupPairingSchema]).parse(args)
  if (ctx.db.recentMatchups.key.delete(JSON.stringify([userId, pairing]))) touchProduct(ctx, userId, 'simulator')
}

function addFavouriteDetachmentIn(ctx: Context, args: unknown[]) {
  const [userId, catalogueId, detachmentId, at] = z.tuple([textArg, textArg, textArg, timestampArg]).parse(args)
  const key = JSON.stringify([userId, catalogueId, detachmentId])
  if (!ctx.db.favouriteDetachments.key.find(key)) {
    ctx.db.favouriteDetachments.insert({ key, userId, catalogueId, detachmentId, at })
    touchProduct(ctx, userId, 'favourites')
  }
}

function removeFavouriteDetachmentIn(ctx: Context, args: unknown[]) {
  const [userId, catalogueId, detachmentId] = z.tuple([textArg, textArg, textArg]).parse(args)
  if (ctx.db.favouriteDetachments.key.delete(JSON.stringify([userId, catalogueId, detachmentId]))) touchProduct(ctx, userId, 'favourites')
}

function setPushEnabledIn(tx: Context, args: unknown[]) {
  const [userId, enabled, now] = z.tuple([textArg, z.boolean(), timestampArg]).parse(args)
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
  if (!validId(userId) || !isPlayerDefaults({ rosterVisibility, battleSize })) throw new SenderError('Invalid player defaults')
  const row = { userId, rosterVisibility, battleSize, at: now }
  if (tx.db.playerDefaults.userId.find(userId)) tx.db.playerDefaults.userId.update(row)
  else tx.db.playerDefaults.insert(row)
  touchProduct(tx, userId, 'settings')
  return productJson({ rosterVisibility: row.rosterVisibility, battleSize: row.battleSize })
}

function leagueCommandIn(tx: Context, args: unknown[]) {
  const [payload] = z.tuple([textArg]).parse(args)
  const value = decodePayload(z.unknown(), payload, 'Invalid league command')
  const operation = leagueCommandInput(z.object({ op: z.string() }), value).op
  if (operation === 'create' || operation === 'create-club-game') {
    const input = leagueCommandInput(
      z.object({
        eventId: idInput,
        eventToken: idInput,
        ownerId: idInput,
        format: leagueFormatInput.nullable(),
        rosterLimit: leagueRosterLimitInput.nullable(),
        allowances: leagueAllowancesSchema.default([]),
        ownerPlays: z.boolean().default(false),
        rounds: leagueRoundsInput.default(null),
        pointsBudget: leaguePointsBudgetInput.default(null),
        soloPoints: leagueArmyPointsInput.default(null),
        allyPoints: leagueArmyPointsInput.default(null),
        sharedPoints: z.boolean().default(false),
        schedule: leagueScheduleInput.default({ playsAt: null, sealBy: null }),
        now: leagueTimeInput,
      }),
      value,
    )
    const points = leaguePointsBudget(input.format ?? '1v1', input.rosterLimit, input.pointsBudget)
    if (!points || (input.rounds !== null && (input.format ?? '1v1') !== '1v1') || leagueArmyPointsError(input.format ?? '1v1', input))
      return productJson('forbidden')
    const createdAt = BigInt(input.now)
    if (operation === 'create') {
      const tournament = leagueCommandInput(leagueDetailsInput.extend({ id: idInput, token: idInput }), value)
      if (!tournament.name.trim()) return productJson('forbidden')
      if (!leaguePlacesSeat(input.format, tournament.playerLimit)) return productJson('too-small')
      tx.db.tournaments.insert({
        id: tournament.id,
        token: tournament.token,
        eventId: input.eventId,
        ownerId: input.ownerId,
        name: tournament.name,
        description: tournament.description,
        visibility: tournament.visibility,
        admission: tournament.admission,
        playerLimit: tournament.playerLimit ?? undefined,
        createdAt,
      })
    } else {
      const club = tx.db.clubs.token.find(leagueCommandInput(z.object({ clubToken: idInput }), value).clubToken)
      // A club's game is casual, so Swiss rounds are a tournament's alone.
      if (!club || input.rounds !== null || !isClubOrganizer(club, clubMemberRows(tx, club), input.ownerId)) return productJson('forbidden')
      const { timeZone } = leagueCommandInput(z.object({ timeZone: clubGameTimeZoneSchema.default('UTC') }), value)
      for (const { game } of clubGameHosts(tx, club))
        if (game.supersededAt === undefined) tx.db.clubGames.eventId.update({ ...game, supersededAt: createdAt })
      tx.db.clubGames.insert({
        eventId: input.eventId,
        clubId: club.id,
        creatorId: input.ownerId,
        createdAt,
        timeZone,
        supersededAt: undefined,
      })
    }
    tx.db.sealedEvents.insert({
      id: input.eventId,
      token: input.eventToken,
      format: input.format ?? undefined,
      rosterLimit: input.rosterLimit ?? undefined,
      allowances: JSON.stringify(input.allowances),
      rounds: input.rounds ?? undefined,
      pointsBudget: points.budget,
      playsAt: input.schedule.playsAt === null ? undefined : BigInt(input.schedule.playsAt),
      sealBy: input.schedule.sealBy === null ? undefined : BigInt(input.schedule.sealBy),
      createdAt,
      revealedAt: undefined,
      revealedBy: undefined,
      soloPoints: input.soloPoints ?? undefined,
      allyPoints: input.allyPoints ?? undefined,
      remindedAt: undefined,
      sharedPoints: input.sharedPoints || undefined,
    })
    if (input.ownerPlays) insertLeagueEntry(tx, input.eventId, input.ownerId, 'accepted', input.now)
    touchEventById(tx, input.eventId)
    return 'null'
  }
  const base = leagueCommandInput(z.object({ token: idInput, eventToken: z.string().max(MAX_ID_LENGTH).default('') }), value)
  const host = namedHost(tx, base.token, base.eventToken)
  if (operation === 'join') {
    const input = leagueCommandInput(
      z.object({
        op: z.literal('join'),
        userId: idInput,
        now: leagueTimeInput,
        memberLimit: leagueMemberLimitInput,
        noticeResults: z.boolean().optional(),
      }),
      value,
    )
    if (!host) return productJson('missing')
    if (pastClubGame(tx, host)) return productJson('past')
    const { event } = host
    // Past the roster deadline a newcomer could never seal, so entry closes with it.
    if (event.revealedAt !== undefined || (event.sealBy !== undefined && BigInt(input.now) > event.sealBy)) return productJson('closed')
    const key = JSON.stringify([event.id, input.userId])
    const existing = tx.db.leagueEventEntries.key.find(key)
    if (existing && existing.status !== 'rejected') return productJson(existing.status)
    if (host.kind === 'club' && !isClubMember(tx, host.club.id, input.userId)) return productJson('members-only')
    const entries = leagueEntriesFor(tx, event.id).filter((entry) => entry.status !== 'rejected')
    const accepted = entries.filter((entry) => entry.status === 'accepted').length
    const rules = hostEntryRules(host)
    if (leagueRegistrationFull(rules, accepted, entries.length, input.memberLimit)) return productJson('full')
    const organizers = hostOrganizerIds(tx, host)
    const status = rules.admission === 'automatic' || organizers.includes(input.userId) ? 'accepted' : 'pending'
    if (existing) tx.db.leagueEventEntries.key.update({ ...existing, status, joinedAt: BigInt(input.now) })
    else insertLeagueEntry(tx, event.id, input.userId, status, input.now)
    touchEvent(tx, host)
    return productJson(status === 'pending' && input.noticeResults ? { status, organizerIds: organizers } : status)
  }
  if (!host) return productJson(operation === 'reveal' ? { outcome: 'not-ready' } : 'missing')
  const { event } = host
  // `ownerId` names whoever acts: an organizer, or for sealing, revealing and battles, an entrant.
  const ownerId = leagueCommandInput(z.object({ ownerId: idInput }), value).ownerId
  const organizer = hostOrganizerIds(tx, host).includes(ownerId)
  // A tournament's owner alone deletes it or chooses its admins; a club game's organizers are the club's.
  const ownerOnly = host.kind === 'tournament' && (operation === 'delete' || operation === 'set-admins')
  if (
    ownerOnly
      ? host.tournament.ownerId !== ownerId
      : ![
          'submit',
          'set-side',
          'set-team-disposition',
          'set-team-warlord',
          'create-battle',
          'reveal',
          'share-roster',
          'dismiss-roster-sharing',
          'drop',
        ].includes(operation) && !organizer
  )
    return productJson('forbidden')

  if (pastClubGame(tx, host) && !['delete', 'share-roster', 'dismiss-roster-sharing'].includes(operation)) return productJson('past')

  if (operation === 'set-admins') {
    if (host.kind !== 'tournament') return productJson('forbidden')
    const { tournament } = host
    const input = leagueCommandInput(
      z.object({ op: z.literal('set-admins'), userIds: z.array(idInput).max(LEAGUE_ADMIN_MAX), now: leagueTimeInput }),
      value,
    )
    const userIds = [...new Set(input.userIds)]
    if (
      userIds.some((userId) => userId === tournament.ownerId || friendshipBetween(tx, tournament.ownerId, userId)?.acceptedAt === undefined)
    )
      return productJson('not-friends')
    const current = Array.from(tx.db.tournamentAdmins.tournamentId.filter(tournament.id))
    for (const row of current) if (!userIds.includes(row.userId)) tx.db.tournamentAdmins.key.delete(row.key)
    for (const userId of userIds) {
      if (current.some((row) => row.userId === userId)) continue
      tx.db.tournamentAdmins.insert({
        key: JSON.stringify([tournament.id, userId]),
        tournamentId: tournament.id,
        userId,
        addedAt: BigInt(input.now),
      })
    }
    touchEvent(tx, host)
    for (const row of current) touchProduct(tx, row.userId, 'leagues')
    return productJson({ added: userIds.filter((userId) => !current.some((row) => row.userId === userId)) })
  }

  if (operation === 'update') {
    const input = leagueCommandInput(
      z.object({
        op: z.literal('update'),
        // Absent to leave a tournament's details as they stand; a club game has none.
        details: leagueDetailsInput.nullable().default(null),
        rule: leagueRuleInput.nullable().default(null),
        // Absent from an older client, which leaves the date and the roster deadline as they stand.
        schedule: leagueScheduleInput.optional(),
      }),
      value,
    )
    const { details } = input
    if (details && (host.kind === 'club' || !details.name.trim())) return productJson('forbidden')
    const entries = leagueEntriesFor(tx, event.id)
    const accepted = entries.filter((entry) => entry.status === 'accepted').length
    const shapeChanged = input.rule !== null && (input.rule.format !== event.format || input.rule.rosterLimit !== event.rosterLimit)
    const pointsChanged =
      input.rule !== null &&
      ((input.rule.soloPoints !== undefined && input.rule.soloPoints !== (event.soloPoints ?? null)) ||
        (input.rule.allyPoints !== undefined && input.rule.allyPoints !== (event.allyPoints ?? null)) ||
        (input.rule.sharedPoints !== undefined && input.rule.sharedPoints !== (event.sharedPoints ?? false)))
    const rule =
      input.rule &&
      (shapeChanged ||
        pointsChanged ||
        (input.rule.allowances !== undefined && JSON.stringify(input.rule.allowances) !== JSON.stringify(leagueEventAllowances(event))))
        ? input.rule
        : null
    // Points per army and allowances stay open after sealing, as long as every sealed list still meets them; the format,
    // size, pairing and a duel's own total lock, since changing them unseats or reprices every list.
    const openAfterSealing =
      rule !== null &&
      !shapeChanged &&
      (rule.rounds === undefined || (rule.rounds ?? undefined) === event.rounds) &&
      (rule.pointsBudget === undefined || (rule.pointsBudget ?? undefined) === event.pointsBudget)
    if (rule) {
      if (event.revealedAt !== undefined) return productJson('closed')
      if (!openAfterSealing && entries.some((entry) => entry.rosterSnapshot !== undefined)) return productJson('sealed')
    }
    const format = (rule?.format ?? event.format ?? null) as TableShape | null
    const playerLimit = details ? details.playerLimit : hostEntryRules(host).playerLimit
    if ((rule || playerLimit !== hostEntryRules(host).playerLimit) && event.revealedAt === undefined) {
      if (!leaguePlacesSeat(format, playerLimit)) return productJson('team-minimum')
      if (playerLimit !== null && playerLimit < accepted) return productJson('below-accepted')
    }
    if (rule) {
      const rounds = rule.rounds === undefined ? event.rounds : (rule.rounds ?? undefined)
      // Swiss rounds pair duels, and a club's game never plays them.
      if (rounds !== undefined && (host.kind === 'club' || rule.format !== '1v1')) return productJson('forbidden')
      const points =
        rule.pointsBudget === undefined
          ? { budget: rule.format === '1v1' && rule.rosterLimit === event.rosterLimit ? event.pointsBudget : undefined }
          : leaguePointsBudget(rule.format, rule.rosterLimit, rule.pointsBudget)
      // Points per army belong to the format and size they were set for, so changing either drops ones left unsaid.
      const kept = rule.format === event.format && rule.rosterLimit === event.rosterLimit
      const soloPoints = rule.soloPoints === undefined ? (kept ? event.soloPoints : undefined) : (rule.soloPoints ?? undefined)
      const allyPoints = rule.allyPoints === undefined ? (kept ? event.allyPoints : undefined) : (rule.allyPoints ?? undefined)
      const sharedPoints = rule.sharedPoints === undefined ? (kept ? event.sharedPoints : undefined) : rule.sharedPoints || undefined
      if (!points || leagueArmyPointsError(rule.format, { soloPoints, allyPoints, sharedPoints })) return productJson('forbidden')
      const next = {
        ...event,
        format: rule.format,
        rosterLimit: rule.rosterLimit,
        allowances: rule.allowances === undefined ? event.allowances : JSON.stringify(rule.allowances),
        rounds,
        pointsBudget: points.budget,
        soloPoints,
        allyPoints,
        sharedPoints,
      }
      if (!sealedListsFit(next, entries)) return productJson('misfit')
      tx.db.sealedEvents.id.update(next)
      // Sizes and pairs follow the format and points; what lists may waive leaves them standing.
      if (rule.format !== event.format || rule.rosterLimit !== event.rosterLimit) {
        for (const entry of entries) tx.db.leagueEventEntries.key.update({ ...entry, requiredLimit: undefined, teamId: undefined })
        clearTeamPicks(tx, event.id)
      }
    }
    if (input.schedule) {
      // Read again, so a rule saved above is not written back over.
      const current = tx.db.sealedEvents.id.find(event.id)!
      tx.db.sealedEvents.id.update({
        ...current,
        playsAt: input.schedule.playsAt === null ? undefined : BigInt(input.schedule.playsAt),
        sealBy: input.schedule.sealBy === null ? undefined : BigInt(input.schedule.sealBy),
      })
    }
    let admitted: string[] = []
    if (details && host.kind === 'tournament') {
      tx.db.tournaments.id.update({
        ...host.tournament,
        name: details.name,
        description: details.description,
        visibility: details.visibility,
        admission: details.admission,
        playerLimit: details.playerLimit ?? undefined,
      })
      if (details.admission === 'automatic' && host.tournament.admission === 'approval' && event.revealedAt === undefined)
        admitted = admitWaiting(tx, entries, details.playerLimit, () => true)
    }
    touchEvent(tx, host)
    return productJson({ admitted, ruleChanged: rule !== null })
  }
  if (operation === 'delete') {
    deleteHost(tx, host)
    return productJson('deleted')
  }
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
    // Every entrant who sealed a list and hasn't dropped sits at exactly one table, and at most one sits the round out.
    const players = leagueEntriesFor(tx, event.id)
      .filter((entry) => entry.status === 'accepted' && entry.rosterSnapshot !== undefined && entry.droppedAt === undefined)
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
    touchEvent(tx, host)
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
      if (current.roster.visibility !== 'public')
        updateOwnedRoster(tx, current.roster.id, ownerId, BigInt(input.now), { visibility: 'public' })
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
    const admitted = admitWaiting(tx, leagueEntriesFor(tx, event.id), hostEntryRules(host).playerLimit, (entry) => chosen.has(entry.userId))
    if (admitted.length) touchEvent(tx, host)
    return productJson({ admitted })
  }
  if (operation === 'add') {
    const input = leagueCommandInput(
      z.object({
        op: z.literal('add'),
        userIds: z.array(idInput).min(1).max(128),
        memberLimit: leagueMemberLimitInput,
        now: leagueTimeInput,
      }),
      value,
    )
    if (event.revealedAt !== undefined) return productJson('closed')
    const userIds = [...new Set(input.userIds)]
    // A tournament seats the organizer's friends, as a battle does; a club game, the club's members.
    if (
      userIds.some((userId) =>
        host.kind === 'club'
          ? !isClubMember(tx, host.club.id, userId)
          : userId === ownerId || friendshipBetween(tx, ownerId, userId)?.acceptedAt === undefined,
      )
    )
      return productJson(host.kind === 'club' ? 'not-members' : 'not-friends')
    const entries = leagueEntriesFor(tx, event.id)
    const current = new Map(entries.map((entry) => [entry.userId, entry]))
    const added = userIds.filter((userId) => current.get(userId)?.status !== 'accepted')
    const accepted = entries.filter((entry) => entry.status === 'accepted').length + added.length
    const returning = added.filter((userId) => current.get(userId)?.status === 'pending').length
    const active = entries.filter((entry) => entry.status !== 'rejected').length + added.length - returning
    const { playerLimit } = hostEntryRules(host)
    if ((playerLimit !== null && accepted > playerLimit) || active > input.memberLimit) return productJson('full')
    for (const userId of added) {
      const existing = current.get(userId)
      if (existing) tx.db.leagueEventEntries.key.update({ ...existing, status: 'accepted', joinedAt: BigInt(input.now) })
      else insertLeagueEntry(tx, event.id, userId, 'accepted', input.now)
    }
    if (added.length) touchEvent(tx, host)
    return productJson({ added })
  }
  if (operation === 'moderate') {
    const input = leagueCommandInput(
      z.object({
        op: z.literal('moderate'),
        userId: idInput,
        status: z.enum(['accepted', 'rejected']),
        memberLimit: leagueMemberLimitInput,
        noticeResults: z.boolean().optional(),
      }),
      value,
    )
    if (event.revealedAt !== undefined) return productJson('closed')
    const entry = tx.db.leagueEventEntries.key.find(JSON.stringify([event.id, input.userId]))
    if (!entry) return productJson('missing')
    const entries = leagueEntriesFor(tx, event.id)
    if (input.status === 'accepted' && entry.status !== 'accepted') {
      const { playerLimit } = hostEntryRules(host)
      if (playerLimit !== null && entries.filter((row) => row.status === 'accepted').length >= playerLimit) return productJson('full')
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
          ...(sharedTeam ? { requiredLimit: undefined, ...UNSEALED } : {}),
        })
    }
    if (input.status === 'rejected')
      tx.db.leagueEventEntries.key.update({
        ...entry,
        status: input.status,
        teamId: undefined,
        requiredLimit: undefined,
        ...UNSEALED,
      })
    else tx.db.leagueEventEntries.key.update({ ...entry, status: input.status })
    touchEvent(tx, host)
    if (input.status === 'rejected')
      return productJson(input.noticeResults ? { rejected: entry.status !== 'rejected', resealIds } : 'updated')
    return productJson(entry.status !== 'accepted' ? 'admitted' : 'updated')
  }
  if (operation === 'assign-limit') {
    const input = leagueCommandInput(
      z.object({
        op: z.literal('assign-limit'),
        userId: idInput,
        requiredLimit: leagueRosterLimitInput,
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
        ...UNSEALED,
      })
      touchEvent(tx, host)
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
          ...(resize ? { requiredLimit: allied, ...UNSEALED } : {}),
        })
      }
      touchEvent(tx, host)
      const resealIds = resized.filter((entry) => entry.rosterSnapshot !== undefined).map((entry) => entry.userId)
      return productJson(input.noticeResults ? { resealIds } : 'updated')
    }
    const resealIds = affected.filter((entry) => entry.rosterSnapshot !== undefined).map((entry) => entry.userId)
    for (const entry of affected)
      tx.db.leagueEventEntries.key.update({
        ...entry,
        teamId: undefined,
        requiredLimit: undefined,
        ...UNSEALED,
      })
    if (userIds.length === 2)
      for (const entry of targets)
        tx.db.leagueEventEntries.key.update({
          ...entry,
          teamId: input.teamId,
          requiredLimit: alliedLeagueRosterLimit(event.rosterLimit),
          ...UNSEALED,
        })
    touchEvent(tx, host)
    return productJson(input.noticeResults ? { resealIds } : 'updated')
  }
  if (operation === 'set-side') {
    const input = leagueCommandInput(
      z.object({ op: z.literal('set-side'), side: z.enum(CLUB_GAME_SIDES).nullable(), now: leagueTimeInput }),
      value,
    )
    // A club's players take their own seats; a tournament's organizer sizes and pairs its entrants.
    if (host.kind !== 'club') return productJson('forbidden')
    if (event.revealedAt !== undefined || (event.sealBy !== undefined && BigInt(input.now) > event.sealBy)) return productJson('closed')
    if (!isClubMember(tx, host.club.id, ownerId)) return productJson('members-only')
    const key = JSON.stringify([event.id, ownerId])
    const entry = tx.db.leagueEventEntries.key.find(key)
    if (input.side === null) {
      if (entry) {
        if (entry.teamId) clearTeamPicks(tx, event.id, new Set([entry.teamId]))
        tx.db.leagueEventEntries.key.delete(key)
        touchEvent(tx, host)
      }
      return productJson('updated')
    }
    const seat = clubGameSeat(event.format, event.rosterLimit, input.side)
    if (!seat) return productJson('wrong-format')
    if (entry && entry.teamId === seat.teamId && entry.requiredLimit === seat.requiredLimit) return productJson('updated')
    const taken = leagueEntriesFor(tx, event.id).filter(
      (row) =>
        row.userId !== ownerId && row.status === 'accepted' && row.teamId === seat.teamId && row.requiredLimit === seat.requiredLimit,
    ).length
    if (taken >= seat.places) return productJson('full')
    // Both sides' Force Disposition and Warlord picks were made for the old line-up, so each side chooses again.
    clearTeamPicks(tx, event.id, new Set([entry?.teamId, seat.teamId].filter((id): id is string => id !== undefined)))
    if (!entry) insertLeagueEntry(tx, event.id, ownerId, 'accepted', input.now)
    const current = tx.db.leagueEventEntries.key.find(key)!
    tx.db.leagueEventEntries.key.update({
      ...current,
      status: 'accepted',
      teamId: seat.teamId,
      requiredLimit: seat.requiredLimit,
      // A list sealed for another seat may not fit this one, so it is sealed again.
      ...UNSEALED,
    })
    touchEvent(tx, host)
    return productJson('updated')
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
    // In a club game sealing a list is how a member takes part, so the first seal also enters them.
    if (
      host.kind === 'club' &&
      event.revealedAt === undefined &&
      !tx.db.leagueEventEntries.key.find(JSON.stringify([event.id, input.userId])) &&
      isClubMember(tx, host.club.id, input.userId)
    )
      insertLeagueEntry(tx, event.id, input.userId, 'accepted', input.now)
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
    const team = event.format === '2v1' || event.format === '2v2'
    if (team && requiredLimit === null) return productJson({ outcome: 'unassigned' })
    if (!team && requiredLimit !== null && input.rosterLimit !== requiredLimit) return productJson({ outcome: 'wrong-limit' })
    const submitted = rosterSnapshotOrNull(input.snapshot)
    if (!submitted) return productJson({ outcome: 'missing' })
    const allowances = leagueEventAllowances(event)
    if (!leagueWarlordWaived(submitted, allowances) && !leagueWarlordValid(submitted))
      return productJson({ outcome: 'invalid-warlords', format: event.format ?? null })
    const refusal = leagueAllowanceRefusal(submitted, allowances)
    if (refusal) return productJson({ outcome: 'disallowed', message: refusal })
    if (event.pointsBudget !== undefined && (submitted.built?.pointsBudget ?? submitted.built?.limit) !== event.pointsBudget)
      return productJson({ outcome: 'wrong-budget', pointsBudget: event.pointsBudget })
    if (!team && submitted.built && !withinArmyPoints(submitted.built, pointsBudgetOf(submitted.built)))
      return productJson({ outcome: 'over-points', points: pointsBudgetOf(submitted.built) })
    const teammate =
      entry.teamId === undefined
        ? undefined
        : leagueEntriesFor(tx, event.id).find(
            (row) => row.userId !== input.userId && row.teamId === entry.teamId && row.status === 'accepted',
          )
    if (team) {
      if (!submitted.built) return productJson({ outcome: 'wrong-limit' })
      const partner = rosterSnapshotOrNull(teammate?.rosterSnapshot)?.built ?? null
      const seat = teamSeatRefusal(event, entry, submitted.built, partner)
      if (seat.refusal === 'wrong-limit') return productJson({ outcome: 'wrong-limit' })
      if (seat.refusal === 'over-points') return productJson({ outcome: 'over-points', points: seat.points })
      // Allies bring lists saved to the same points total, so the first to seal sets it for the other, unless they share points.
      if (
        partner &&
        !leagueSharesPoints(eventPoints(event), { requiredLimit: entry.requiredLimit ?? null }) &&
        pointsBudgetOf(partner) !== pointsBudgetOf(submitted.built)
      )
        return productJson({ outcome: 'ally-mismatch', pointsBudget: pointsBudgetOf(partner) })
    }
    if (event.format === '2v2' && !teammate) return productJson({ outcome: 'unassigned' })
    // After reveal the pair's card is fixed, so a replacement list must leave it one the pair still offers.
    const pick =
      event.revealedAt !== undefined && entry.teamId ? tx.db.leagueEventTeams.key.find(JSON.stringify([event.id, entry.teamId])) : undefined
    if (pick) {
      const partner = rosterSnapshotOrNull(teammate?.rosterSnapshot)
      if (partner && !teamDispositionChoices([submitted, partner]).includes(pick.disposition))
        return productJson({ outcome: 'disposition-dropped', disposition: pick.disposition })
    }
    const saved = tx.db.rosters.id.find(input.rosterId)
    if (
      !saved ||
      saved.userId !== input.userId ||
      saved.updatedAt !== BigInt(input.rosterUpdatedAt) ||
      (requiredLimit !== null && saved.limit !== (team ? submitted.built?.limit : requiredLimit))
    )
      return productJson({ outcome: 'missing' })
    tx.db.leagueEventEntries.key.update({
      ...entry,
      rosterId: input.rosterId,
      rosterName: input.rosterName,
      rosterSnapshot: input.snapshot,
      submittedAt: BigInt(input.now),
    })
    touchEvent(tx, host)
    return productJson({ outcome: 'sealed', format: event.format ?? null, requiredLimit })
  }
  if (operation === 'set-team-disposition' || operation === 'set-team-warlord') {
    const warlord = operation === 'set-team-warlord'
    const choice = warlord
      ? leagueCommandInput(z.object({ op: z.literal(operation), userId: idInput, now: leagueTimeInput }), value).userId
      : leagueCommandInput(z.object({ op: z.literal(operation), disposition: z.string().min(1).max(64), now: leagueTimeInput }), value)
          .disposition
    if (event.revealedAt !== undefined) return productJson({ outcome: 'closed' })
    const entry = tx.db.leagueEventEntries.key.find(JSON.stringify([event.id, ownerId]))
    if (!entry || entry.status !== 'accepted' || !entry.teamId) return productJson({ outcome: 'missing' })
    const team = eventTeams(tx, event.id, leagueEntriesFor(tx, event.id)).find((candidate) => candidate.id === entry.teamId)
    if (!team || !(warlord ? team.warlordChoices : team.choices).includes(choice)) return productJson({ outcome: 'not-offered' })
    if (warlord) setTeamWarlord(tx, event.id, team.id, choice)
    else setTeamPick(tx, event.id, team.id, choice)
    touchEvent(tx, host)
    return productJson({ outcome: 'chosen' })
  }
  if (operation === 'reveal') {
    const input = leagueCommandInput(z.object({ op: z.literal('reveal'), now: leagueTimeInput }), value)
    if (event.revealedAt !== undefined) return productJson({ outcome: 'not-ready' })
    const actor = tx.db.leagueEventEntries.key.find(JSON.stringify([event.id, ownerId]))
    if (!mayRevealLeague(organizer, actor ? { status: actor.status as LeagueEntryStatus } : null))
      return productJson({ outcome: 'not-ready' })
    const revealed = revealLeagueEvent(tx, event, input.now, ownerId)
    if (revealed.outcome === 'revealed') touchEvent(tx, host)
    return productJson(revealed)
  }
  if (operation === 'unseal') {
    const input = leagueCommandInput(z.object({ op: z.literal('unseal'), userId: idInput }), value)
    if (event.revealedAt === undefined) return productJson('not-revealed')
    const entry = tx.db.leagueEventEntries.key.find(JSON.stringify([event.id, input.userId]))
    if (!entry || entry.status !== 'accepted' || entry.rosterSnapshot === undefined) return productJson('missing')
    tx.db.leagueEventEntries.key.update({ ...entry, ...UNSEALED })
    touchEvent(tx, host)
    return productJson('unsealed')
  }
  if (operation === 'remind') {
    const input = leagueCommandInput(z.object({ op: z.literal('remind'), now: leagueTimeInput }), value)
    const remindedAt = event.remindedAt === undefined ? null : safeNumber(event.remindedAt)
    if (!mayRemindLeague(remindedAt, input.now)) return productJson({ outcome: 'too-soon', remindedAt })
    const recipientIds = leagueReminderRecipients(
      {
        revealedAt: event.revealedAt === undefined ? null : safeNumber(event.revealedAt),
        sealBy: event.sealBy === undefined ? null : safeNumber(event.sealBy),
      },
      leagueEntriesFor(tx, event.id).map((entry) => ({
        userId: entry.userId,
        status: entry.status as LeagueEntryStatus,
        submitted: entry.rosterSnapshot !== undefined,
      })),
      input.now,
    ).filter((userId) => userId !== ownerId)
    if (!recipientIds.length) return productJson({ outcome: 'nobody' })
    tx.db.sealedEvents.id.update({ ...event, remindedAt: BigInt(input.now) })
    touchEvent(tx, host)
    return productJson({ outcome: 'reminded', recipientIds })
  }
  if (operation === 'drop') {
    const input = leagueCommandInput(z.object({ op: z.literal('drop'), userId: idInput, now: leagueTimeInput }), value)
    // An entrant withdraws only themselves; dropping anyone else takes an organizer.
    if (input.userId !== ownerId && !organizer) return productJson('forbidden')
    if (event.revealedAt === undefined || event.rounds === undefined) return productJson('closed')
    const entry = tx.db.leagueEventEntries.key.find(JSON.stringify([event.id, input.userId]))
    if (!entry || entry.status !== 'accepted' || entry.droppedAt !== undefined) return productJson('missing')
    tx.db.leagueEventEntries.key.update({ ...entry, droppedAt: BigInt(input.now) })
    // A battle still going at their table stays, but no longer decides it: the opponent takes the table as a bye.
    for (const pairing of roundPairings(tx, event.id))
      if (pairing.battleId !== undefined && (pairing.aId === input.userId || pairing.bId === input.userId)) {
        const battle = tx.db.battles.id.find(pairing.battleId)
        if (!battle || battleState(tx, pairing.battleId).state.status !== 'finished')
          tx.db.leagueRoundPairings.key.update({ ...pairing, battleId: undefined })
      }
    touchEvent(tx, host)
    return productJson('dropped')
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
        pairingFinished(tx, pairing) ||
        !players.has(input.userId) ||
        !players.has(input.opponentIds[0]) ||
        input.opponentIds.length !== 1 ||
        input.allyIds.length
      )
        return productJson(false)
    }
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
    insertBattle(
      tx,
      { id: input.id, token: input.battleToken, now: input.now, by: input.userId, seats },
      input.initialCommands,
      (state, command) => (command.kind === 'set-battle-club' ? 'a club is chosen during setup' : validate(state, input.userId, command)),
    )
    tx.db.leagueEventBattles.insert({ battleId: input.id, eventId: event.id })
    if (pairing && event.rounds !== undefined) tx.db.leagueRoundPairings.key.update({ ...pairing, battleId: input.id })
    touchEvent(tx, host)
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
} satisfies Record<SyncProductActionName, unknown>

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
  operatorTx(ctx, (tx) => {
    const receipt = tx.db.syncReceipts.id.find(input.id)
    if (!receipt) return 'null'
    if (receipt.owner !== input.owner || receipt.fingerprint !== input.fingerprint) throw new SenderError('Operation ID reused')
    return productJson({ outcome: receipt.outcome, message: receipt.message })
  }),
)

export const syncProduct = spacetime.procedure({ payload: t.string() }, t.string(), (ctx, { payload }) =>
  operatorTx(ctx, (tx) => {
    if (payload.length > 2_100_000) throw new SenderError('Saved action is too large')
    const input = decodePayload(syncProductInput, payload, 'Invalid saved action')
    const prior = tx.db.syncReceipts.id.find(input.id)
    if (prior) {
      if (prior.owner !== input.owner || prior.fingerprint !== input.fingerprint) throw new SenderError('Operation ID reused')
      return input.reportApplied ? productJson({ result: prior.result, applied: false }) : prior.result
    }
    const now = safeNumber(nowMs(tx))
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
    const encoded = productJson(result ?? null)
    tx.db.syncReceipts.insert({
      id: input.id,
      owner: input.owner,
      fingerprint: input.fingerprint,
      createdAt: BigInt(now),
      result: encoded,
      outcome: refusal ? 'refused' : 'applied',
      message: refusal ?? '',
    })
    return input.reportApplied ? productJson({ result: encoded, applied: !refusal }) : encoded
  }),
)
