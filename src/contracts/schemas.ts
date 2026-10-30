import { ADMIN_USER_ROLES, ADMIN_USER_SORTS } from '../admin'
import { z } from 'zod'
import { REPLAY_BATCH_SIZE } from './battles'
import { onboardingTaskIds, tourTaskIds } from '../core/onboarding'
import { PLAYER_SEARCH_MAX_LENGTH } from '../core/playerSearch'
import { MAX_COLLECTION_DATASHEETS, MAX_COUNTS_AS } from '../core/collection'
import { collectionCount, collectionModels } from './collection'
import { PUSH_PLATFORMS } from '../core/notificationConfig'
import { unitLoadoutNameSchema, unitLoadoutSchema } from '../core/unitLoadouts'
import { pushTokenSchema } from '../core/notifications'
import {
  customPointsBudget,
  FORMAT_RULE_IDS,
  isGameSize,
  isKotcLimit,
  OPTIONAL_RULE_IDS,
  DETACHMENTS_MAX,
  POINTS_BUDGET_MAX,
  POINTS_BUDGET_MIN,
  pointsBudgetError,
  ROSTER_NAME_MAX_LENGTH,
  SECONDARIES_MAX,
  STRATAGEMS_MAX,
} from '../core/battle'
import { ABILITY_REMINDERS_MAX, abilityReminderSchema, rosterReminderSchema, ROSTER_REMINDERS_MAX } from '../core/reminders'
import {
  commandSchema,
  detachmentIdSchema,
  idSchema as id,
  nameSchema,
  rosterLimitSchema as rosterLimit,
  rosterPickSchema,
  stratagemSchema,
} from '../core/commands'
import { currentCatalogueId, currentEntryId, currentRosterIds } from '../core/retiredCatalogueIds'
import { ROSTER_SOURCES, ROSTER_VISIBILITIES } from '../core/savedRoster'
import { ROSTER_LIBRARY_BATCH_SIZE } from '../core/rosterLibrary'
import { ROSTER_AUDIENCES, rosterDiscoveryCursorSchema, rosterDiscoveryFilterSchema } from '../core/rosterDiscovery'
import { ROSTER_SORTS } from '../core/rosterSort'
import { isPlayerDefaults } from '../core/playerDefaults'
import { recentMatchupSchema } from '../core/recentMatchups'
import { simulatorPairing } from './simulatorState'
import {
  isTeamFormat,
  LEAGUE_ADMISSIONS,
  leagueAllowancesSchema,
  LEAGUE_DESCRIPTION_MAX_LENGTH,
  LEAGUE_DEFAULT_ROSTER_LIMIT,
  LEAGUE_ADMIN_MAX,
  LEAGUE_MEMBER_MAX,
  LEAGUE_MEMBER_MIN,
  LEAGUE_NAME_MAX_LENGTH,
  LEAGUE_TEAM_ROSTER_LIMITS,
  LEAGUE_VISIBILITIES,
  leagueArmyPointsError,
  type LeagueArmyPoints,
} from '../core/league'
import { TABLE_SHAPES, type TableShape } from '../core/tableShape'
import { CLUB_ADMIN_MAX, CLUB_DESCRIPTION_MAX_LENGTH, CLUB_GAME_SIDES, CLUB_NAME_MAX_LENGTH, clubGameTimeZoneSchema } from '../core/club'
import { SWISS_ROUNDS_MAX } from '../core/swiss'
import { CLUB_SEASON_PLAYERS_MAX, CLUB_SEASON_SEED_MAX } from '../core/clubSeason'
import { PASSWORD_MIN_LENGTH, SOCIAL_PROVIDERS } from '../authConfig'
import { PROFILE_NAME_MAX_LENGTH } from '../core/profileName'

const token = id
// Ids a client sends may predate a retired source: a guest draft, an open tab, an agent's cache.
const catalogueId = id.transform(currentCatalogueId)
const slug = z.string().min(1).max(160)
/**
 * A custom points budget beside the battle size. Absent is not the same as null: a client
 * built before budgets existed omits it, and its save keeps whatever budget is stored.
 */
const pointsBudget = z.number().int().min(POINTS_BUDGET_MIN).max(POINTS_BUDGET_MAX).nullable().optional()
function validatePointsBudget(value: { limit: number; pointsBudget?: number | null }, context: z.RefinementCtx) {
  const message = pointsBudgetError(value.limit, value.pointsBudget)
  if (message) context.addIssue({ code: 'custom', path: ['pointsBudget'], message })
}
const withStandardBudget = <T extends { limit: number; pointsBudget?: number | null }>(value: T): T =>
  value.pointsBudget === undefined ? value : { ...value, pointsBudget: customPointsBudget(value.limit, value.pointsBudget) }
const battlesCursor = z.object({ at: z.number().int().min(0), id })

export const tokenSchema = z.object({ token })
export const battleReplaySchema = z.object({ token, seq: z.number().int().min(1) })
export const battleReplayBatchSchema = z.object({ token, seqs: z.array(z.number().int().min(1)).min(1).max(REPLAY_BATCH_SIZE) })
const tournamentFields = {
  name: z.string().trim().min(1, 'add a name').max(LEAGUE_NAME_MAX_LENGTH),
  description: z.string().trim().max(LEAGUE_DESCRIPTION_MAX_LENGTH),
  visibility: z.enum(LEAGUE_VISIBILITIES),
  admission: z.enum(LEAGUE_ADMISSIONS),
  playerLimit: z.number().int().min(LEAGUE_MEMBER_MIN).max(LEAGUE_MEMBER_MAX).nullable(),
}
const leagueEventRuleFields = {
  format: z.enum(TABLE_SHAPES).default('1v1'),
  rosterLimit: z.number().int().refine(isGameSize).default(LEAGUE_DEFAULT_ROSTER_LIMIT),
  allowances: leagueAllowancesSchema.default([]),
  // Absent from an older client: no Swiss rounds or own points total on a new event, and an edit leaves them as they stand.
  rounds: z.number().int().min(1).max(SWISS_ROUNDS_MAX).nullable().optional(),
  pointsBudget,
  soloPoints: z.number().int().min(1).max(POINTS_BUDGET_MAX).nullable().optional(),
  allyPoints: z.number().int().min(1).max(POINTS_BUDGET_MAX).nullable().optional(),
  sharedPoints: z.boolean().optional(),
}
/** When the event is played and the roster deadline, as instants; a deadline after the date would let lists in once play started. */
const leagueSchedule = z
  .object({ playsAt: z.number().int().min(0).nullable(), sealBy: z.number().int().min(0).nullable() })
  .refine(({ playsAt, sealBy }) => playsAt === null || sealBy === null || sealBy <= playsAt, {
    message: 'set the roster deadline before the date it is played',
    path: ['sealBy'],
  })
function validateLeagueEventRule(
  value: { format: TableShape; rosterLimit: number; rounds?: number | null } & Partial<LeagueArmyPoints>,
  context: z.RefinementCtx,
) {
  const armyPointsProblem = leagueArmyPointsError(value.format, value)
  if (armyPointsProblem) context.addIssue({ code: 'custom', path: ['allyPoints'], message: armyPointsProblem })
  if (isTeamFormat(value.format) && !LEAGUE_TEAM_ROSTER_LIMITS.some((limit) => limit === value.rosterLimit)) {
    context.addIssue({ code: 'custom', path: ['rosterLimit'], message: `choose a supported ${value.format} roster size` })
  }
  if (value.rounds != null && value.format !== '1v1')
    context.addIssue({ code: 'custom', path: ['rounds'], message: 'Swiss rounds pair duels only' })
}
export const createLeagueSchema = z
  .object({
    ...tournamentFields,
    description: tournamentFields.description.default(''),
    playerLimit: tournamentFields.playerLimit.default(null),
    ...leagueEventRuleFields,
    ownerPlays: z.boolean().default(false),
    schedule: leagueSchedule.optional(),
  })
  .superRefine(validateLeagueEventRule)
/** A club's casual sealed game: no name, visibility, admission or limit of its own, and no Swiss rounds. */
export const createClubGameSchema = z
  .object({
    clubToken: token,
    timeZone: clubGameTimeZoneSchema.optional(),
    ...leagueEventRuleFields,
    rounds: z.null().optional(),
    schedule: leagueSchedule.optional(),
  })
  .superRefine(validateLeagueEventRule)
const tournamentDetailKeys = Object.keys(tournamentFields) as (keyof typeof tournamentFields)[]
export const updateLeagueSchema = z
  .object({
    token,
    // A tournament's details, all or none; a club game has none, and an edit without them leaves a tournament's standing.
    ...z.object(tournamentFields).partial().shape,
    // An older client omits allowances, which must leave the event's house rules as they stand.
    rule: z
      .object({ ...leagueEventRuleFields, allowances: leagueAllowancesSchema.optional() })
      .superRefine(validateLeagueEventRule)
      .optional(),
    schedule: leagueSchedule.optional(),
  })
  .refine((value) => new Set(tournamentDetailKeys.map((key) => value[key] === undefined)).size === 1, {
    message: 'send every tournament detail or none',
  })
/**
 * `token` is the event's host: a tournament's token, or a club game's, which is its event's. `eventToken` names the
 * event itself, as a client from before each event had its own host sends it beside its old league's token.
 */
const leagueEvent = { token, eventToken: token.optional() }
export const leagueEventSchema = z.object(leagueEvent)
export const pairLeagueRoundSchema = z.object(leagueEvent)
export const reopenSwissTableSchema = z.object({ ...leagueEvent, battleToken: token })
export const openLeagueSchema = z.object(leagueEvent)
export const moderateLeagueEntrySchema = z.object({
  ...leagueEvent,
  userId: id,
  status: z.enum(['accepted', 'rejected']),
})
export const addLeagueEntrantsSchema = z.object({
  ...leagueEvent,
  userIds: z.array(id).min(1).max(LEAGUE_MEMBER_MAX),
})
export const admitLeagueEntriesSchema = z.object({
  ...leagueEvent,
  userIds: z.array(id).min(1).max(LEAGUE_MEMBER_MAX),
})
export const submitLeagueRosterSchema = z.object({ ...leagueEvent, rosterId: id })
export const setLeagueTeamDispositionSchema = z.object({ ...leagueEvent, disposition: z.string().min(1).max(64) })
export const setLeagueTeamWarlordSchema = z.object({ ...leagueEvent, userId: id })
export const assignLeagueRosterRequirementSchema = z.object({
  ...leagueEvent,
  userId: id,
  requiredLimit: z.number().int(),
})
/** A club game's player takes a seat themselves; `null` steps out before the reveal. */
export const chooseLeagueSideSchema = z.object({
  ...leagueEvent,
  side: z.enum(CLUB_GAME_SIDES).nullable(),
})
export type LeagueSide = NonNullable<z.infer<typeof chooseLeagueSideSchema>['side']>
export const assignLeagueTeamSchema = z.object({
  ...leagueEvent,
  userIds: z
    .array(id)
    .min(1)
    .max(2)
    .refine((ids) => new Set(ids).size === ids.length, 'choose different entrants'),
})
export const leagueRosterSchema = z.object({ ...leagueEvent, userId: id })
export const leagueBattlesSchema = z.object({ token, eventToken: token, before: battlesCursor.nullable().default(null) })
export const leagueResultsSchema = z.object({ token, eventToken: token })
export const setLeagueAdminsSchema = z.object({ token, userIds: z.array(id).max(LEAGUE_ADMIN_MAX) })
const clubFields = {
  name: z.string().trim().min(1, 'name the club').max(CLUB_NAME_MAX_LENGTH),
  description: z.string().trim().max(CLUB_DESCRIPTION_MAX_LENGTH).default(''),
  visibility: z.enum(LEAGUE_VISIBILITIES),
  admission: z.enum(LEAGUE_ADMISSIONS),
}
export const createClubSchema = z.object(clubFields)
export const updateClubSchema = z.object({ token, ...clubFields })
export const clubMemberSchema = z.object({ token, userId: id })
export const moderateClubMemberSchema = z.object({ token, userId: id, accept: z.boolean() })
export const setClubAdminsSchema = z.object({ token, userIds: z.array(id).max(CLUB_ADMIN_MAX) })
/** The draw the organizer reviewed, so publishing refuses one that changed meanwhile. */
export const publishClubSeasonSchema = z.object({
  token,
  seed: z.number().int().min(0).max(CLUB_SEASON_SEED_MAX),
  playerIds: z.array(id).max(CLUB_SEASON_PLAYERS_MAX),
})
export const clubSeasonDeadlineSchema = z.object({
  token,
  round: z.number().int().min(1).max(CLUB_SEASON_PLAYERS_MAX),
  deadline: z.number().int().nonnegative().nullable(),
})
export const createLeagueBattleSchema = z.object({
  ...leagueEvent,
  opponentId: id,
  allyId: id.optional(),
  secondOpponentId: id.optional(),
  missionPackId: id.nullable().default(null),
})
const newBattlePlayers = {
  opponentId: id.optional(),
  opponentIds: z.array(id).min(1).max(2).optional(),
  allyId: id.optional(),
}
export const leagueBattleOptionsSchema = z.object(newBattlePlayers)
/** A roster read may name the battle that entitles the reader to it. */
export const rosterInBattleSchema = z.object({ id, battle: token.optional() })
const opposingSeats = (value: { opponentId?: string; opponentIds?: string[]; guestNames?: string[] }) =>
  (value.opponentIds?.length ?? (value.opponentId ? 1 : 0)) + (value.guestNames?.length ?? 0)
/**
 * Who is in a new battle, and on which side.
 *
 * `allyId` sits with the creator and `opponentIds` face them, so the same 2v1 can be
 * opened by either player of the allied pair. A 2v2 adds one ally and two opponents,
 * and the combined seat count is bounded rather than either side on its own.
 * `guestNames` seats opponents without an account on the opposing side.
 */
export const createBattleSchema = z
  .object({
    ...newBattlePlayers,
    limit: z.number().int().refine(isGameSize).nullable().optional(),
    guestNames: z.array(z.string().trim().min(1).max(PROFILE_NAME_MAX_LENGTH)).min(1).max(2).optional(),
    missionPackId: id.nullable().default(null),
    casual: z.boolean().default(false),
    manual: z.boolean().default(false),
    clubToken: token.optional(),
    fixture: z.string().max(300).optional(),
  })
  .refine((value) => !value.fixture || value.clubToken, 'a fixture is played from its club')
  .refine((value) => opposingSeats(value) <= 2, 'a side seats two players at most')
  .refine((value) => (value.allyId ? 1 : 0) + opposingSeats(value) <= 3, 'a battle seats four players at most')
  .refine((value) => !value.allyId || opposingSeats(value) > 0, 'an ally needs someone to play against')
export const deleteBattleSchema = z.object({ token })
export const battlesPageSchema = z.object({
  before: battlesCursor.nullable().default(null),
})
export const playerDefaultsSchema = z
  .object({ rosterVisibility: z.enum(ROSTER_VISIBILITIES), battleSize: z.number().int() })
  .refine(isPlayerDefaults, 'choose a supported battle size')
export const pushPreferenceSchema = z.object({ enabled: z.boolean() })
export const pushDeviceSchema = z.object({ token: pushTokenSchema, platform: z.enum(PUSH_PLATFORMS) })
export const pushTokenOnlySchema = z.object({ token: pushTokenSchema })
export const userSchema = z.object({ userId: id })
export const playerSearchSchema = z.object({ query: z.string().trim().max(PLAYER_SEARCH_MAX_LENGTH) })
export const friendSchema = z.object({ userId: id })
const onboardingTaskSchema = z.enum(onboardingTaskIds)
/** Only a tour can be completed by saying so; every other task is folded from what the player did. */
export const onboardingUpdateSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('complete'), task: z.enum(tourTaskIds) }),
  z.object({ operation: z.literal('skip'), task: onboardingTaskSchema }),
  z.object({ operation: z.literal('restore'), task: onboardingTaskSchema }),
  z.object({ operation: z.literal('welcome') }),
])
export const friendInviteSchema = z.object({ token })
/** A guest seat in a battle; `replace` retires its link and any device that joined through it. */
export const guestInviteSchema = z.object({ token, playerId: id, replace: z.boolean().default(false) })
export const guestInvitationSchema = z.object({ invite: token })
/** A BattleBase username, as its profile URLs spell them. */
export const battlebaseUsernameSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[\w.-]{1,64}$/),
})
/** A BattleBase account to prove and import from, or none to import again from the one already linked. */
export const battlebaseImportSchema = battlebaseUsernameSchema.partial()

/**
 * A player's profile, and what to narrow their record by.
 *
 * Every filter is optional and absent means all of them, so an address that names
 * none of them is the whole record. Names are bounded because they arrive as text
 * from a link rather than from a control.
 */
const filterName = z.string().trim().min(1).max(120).optional()
export const playerProfileSchema = z.object({
  userId: id,
  faction: filterName,
  detachment: filterName,
  opponentFaction: filterName,
  opponentDetachment: filterName,
  opponentId: id.optional(),
  missionPackId: filterName,
  limit: z.number().int().positive().max(100_000).optional(),
})
export const setOwnPasswordSchema = z.object({ password: z.string().min(PASSWORD_MIN_LENGTH).max(128) })
export const unlinkOwnAccountSchema = z.object({ provider: z.enum(['credential', ...SOCIAL_PROVIDERS]) })
export const setAdminRoleSchema = z.object({ userId: id, role: z.enum(['admin', 'user']) })
export const adminSessionSchema = z.object({ userId: id, sessionId: z.string().min(1).max(128) })
export const adminRenameSchema = z.object({ userId: id, name: z.string().trim().min(1).max(PROFILE_NAME_MAX_LENGTH) })
export const adminUnlinkSchema = z.object({ userId: id, provider: z.enum(['credential', ...SOCIAL_PROVIDERS]) })
export const adminConnectionSchema = z.object({ userId: id, connectionId: z.string().min(1).max(200) })
export const adminBattleSchema = z.object({ battle: token })
export const adminUsersSchema = z.object({
  query: z.string().trim().max(100).default(''),
  sort: z.enum(ADMIN_USER_SORTS).default('joined'),
  descending: z.boolean().default(true),
  role: z.array(z.enum(ADMIN_USER_ROLES)).max(ADMIN_USER_ROLES.length).default([]),
  page: z.number().int().min(0).max(10_000).default(0),
  pageSize: z.number().int().min(1).max(100).default(25),
})

/**
 * The format restrictions this roster has switched off, by the ids `formatRules` names.
 *
 * Sent with every read that a restriction can change the answer of, so the picker and
 * the price agree about which rules are being played. Unknown ids are rejected rather
 * than ignored: a waiver this build cannot name would silently enforce a rule the
 * player believes they turned off.
 */
export const waivedRules = z.array(z.enum(FORMAT_RULE_IDS)).max(FORMAT_RULE_IDS.length).optional()
export const optionalRules = z.array(z.enum(OPTIONAL_RULE_IDS)).max(OPTIONAL_RULE_IDS.length).optional()

export const picksSchema = z.array(rosterPickSchema).max(100)

export const unitsSchema = z.object({
  catalogueId,
  detachmentIds: z.array(detachmentIdSchema).max(DETACHMENTS_MAX).optional(),
  query: z.string().max(80).default(''),
  battleSize: z
    .number()
    .int()
    .refine((value) => isGameSize(value) || isKotcLimit(value))
    .optional(),
  waivedRules,
})

/** A player's own roster books are few, so the bound is every faction rather than a page. */
export const datasheetOfferedBySchema = z.object({ entryId: id, catalogueIds: z.array(catalogueId).min(1).max(64) })

export const globalSearchSchema = z.object({ query: z.string().trim().min(2).max(80) })

/**
 * A list is sent as the entries the player picked and how many models they want
 * in each; the server expands every one to a legal selection.
 */
export const datasheetSchema = z
  .object({
    catalogueId: id,
    entryId: id,
    detachmentIds: z.array(detachmentIdSchema).max(DETACHMENTS_MAX).default([]),
    picks: picksSchema.default([]),
    pickIndex: z.number().int().min(0).max(99).nullable().default(null),
    /** Keep weapons the unit is not carrying, so options read as this list would make them. */
    everyWeapon: z.boolean().default(false),
  })
  .overwrite((data) => {
    const roster = currentRosterIds(data)
    return { ...roster, entryId: currentEntryId(data.entryId, roster.catalogueId) }
  })
/** A roster whose units' abilities its alerts are matched against. */
export const reminderAbilitiesSchema = z
  .object({
    catalogueId: id,
    detachmentIds: z.array(detachmentIdSchema).max(DETACHMENTS_MAX).default([]),
    picks: picksSchema,
  })
  .overwrite(currentRosterIds)
/** A roster pick whose weapon options the simulator compares. */
export const combatLoadoutSchema = z
  .object({
    catalogueId: id,
    detachmentIds: z.array(detachmentIdSchema).max(DETACHMENTS_MAX).default([]),
    picks: z.array(rosterPickSchema).min(1).max(100),
    pickIndex: z.number().int().min(0).max(99),
    walk: z.object({ seed: z.number().int().min(0).max(2_147_483_647), steps: z.number().int().min(1).max(16) }).optional(),
  })
  .overwrite(currentRosterIds)
export const savedRosterDatasheetSchema = rosterInBattleSchema.extend({ pickIndex: z.number().int().min(0).max(99) })
export const datasheetSlugSchema = z.object({ catalogueId, slug })

/** The datasheets of one army, asked about together because a list is attached in one go. */
export const unitWoundsSchema = z
  .object({ catalogueId, entryIds: z.array(id).max(200) })
  .overwrite((data) => ({ ...data, entryIds: data.entryIds.map((entryId) => currentEntryId(entryId, data.catalogueId)) }))

const prepSchema = z.object({
  stratagems: z.array(stratagemSchema).max(STRATAGEMS_MAX),
  secondaries: z.array(z.object({ key: id, name: nameSchema })).max(SECONDARIES_MAX),
  /** Per-unit alerts from older builds, which the product module moves to the owner's account on save; none is no field. */
  reminders: z
    .array(rosterReminderSchema)
    .max(ROSTER_REMINDERS_MAX)
    .transform((reminders) => (reminders.length ? reminders : undefined))
    .optional(),
  remindersEnabled: z.boolean().default(true),
})

export const saveRosterSchema = z
  .object({
    id: id.optional(),
    /** Empty when the player wants a name generated from the saved roster. */
    name: z.string().trim().max(ROSTER_NAME_MAX_LENGTH),
    catalogueId: id,
    detachmentIds: z.array(detachmentIdSchema).max(DETACHMENTS_MAX),
    disposition: id.nullable(),
    borrowedDetachmentId: detachmentIdSchema.nullable().default(null),
    limit: rosterLimit,
    pointsBudget,
    picks: picksSchema,
    waivedRules,
    optionalRules,
    prep: prepSchema.nullable(),
    visibility: z.enum(ROSTER_VISIBILITIES).default('private'),
    source: z.enum(ROSTER_SOURCES).default('editable'),
  })
  .superRefine(validatePointsBudget)
  .overwrite((value) => withStandardBudget(currentRosterIds(value)))

const attachSavedRosterSchema = z.object({ kind: z.literal('attach-saved-roster'), rosterId: id, playerId: id.optional() }).strict()
/** A guest has no saved lists, so they field the one this device is building, priced and frozen by the server, with this browser's alerts. */
const attachDraftRosterSchema = z
  .object({
    kind: z.literal('attach-draft-roster'),
    draft: saveRosterSchema,
    reminders: z.array(abilityReminderSchema).max(ABILITY_REMINDERS_MAX).optional(),
  })
  .strict()
/**
 * `expectedSeq` is the client's claim about the history it has already seen.
 * Sending it is what makes a command conditional on nothing having happened since.
 */
export const submitSchema = z.object({
  token,
  expectedSeq: z.number().int().min(0),
  command: z.union([commandSchema, attachSavedRosterSchema, attachDraftRosterSchema]),
})

/** A Praetorium, BattleBase or New Recruit text export, which no roster comes close to filling. */
export const importRosterSchema = z.object({ file: z.string().min(1).max(200_000) })
/** Where to look for lists to import: a player's public BattleBase rosters, or New Recruit share links. */
export const importableRostersSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('battlebase'), username: battlebaseUsernameSchema.shape.username }),
  z.object({ source: z.literal('newrecruit'), links: z.array(z.string().trim().min(1).max(200)).min(1).max(20) }),
])
export type ImportRosterInput = z.infer<typeof importRosterSchema>

export const detachmentRulesSchema = z.object({
  catalogueId,
  detachmentNames: z.array(z.string().min(1).max(120)).min(1).max(DETACHMENTS_MAX),
})
export const detachmentDetailSchema = z.object({ catalogueId, slug })

export const rosterIdSchema = z.object({ id })
/** `setup` saves a reviewed rules-version conversion as a variant, leaving the original as it was. */
export const copyRosterSchema = z
  .object({ id, variant: z.boolean(), setup: saveRosterSchema.optional() })
  .refine((data) => !data.setup || data.variant, 'Only a variant can take a converted setup.')
export const rosterIdsSchema = z.object({
  ids: z
    .array(id)
    .min(1)
    .max(ROSTER_LIBRARY_BATCH_SIZE)
    .refine((ids) => new Set(ids).size === ids.length),
})
export const rosterDiscoverySchema = rosterDiscoveryFilterSchema.extend({
  audience: z.enum(ROSTER_AUDIENCES).default('public'),
  sort: z.enum(ROSTER_SORTS).default('updated-desc'),
  before: rosterDiscoveryCursorSchema.nullable().default(null),
})
export const rosterVisibilitySchema = z.object({ id, visibility: z.enum(ROSTER_VISIBILITIES) })
export const rosterLockSchema = z.object({ id, locked: z.boolean() })
export const rosterArchiveSchema = z.object({ id, archived: z.boolean() })
export const rosterLoanSchema = z.object({ id, borrowerId: id })
export const playedArmiesSchema = rosterDiscoveryFilterSchema.extend({ before: battlesCursor.nullable().default(null) })
export const playedArmySchema = z.object({ token, playerId: id })
export const saveUnitLoadoutSchema = unitLoadoutSchema.extend({ id: z.uuid() })
export const unitLoadoutIdSchema = z.object({ id: z.uuid() })
export const renameUnitLoadoutSchema = unitLoadoutIdSchema.extend({ name: unitLoadoutNameSchema })

export const ownedSchema = z.object({ entryId: id, owned: z.boolean() })
export const collectionModelsSchema = z.object({ entryId: id, models: collectionModels })
export const collectionProgressSchema = z
  .object({ entryId: id, built: collectionCount, painted: collectionCount })
  .refine((input) => input.painted <= input.built, 'Painted models must be built')
export const collectionWantedSchema = z.object({ entryId: id, wanted: collectionCount })
const countsAs = z.array(id).max(MAX_COUNTS_AS)
export const collectionCountsAsSchema = z.object({ entryId: id, countsAs })
export const collectionImportSchema = z.object({
  rows: z
    .array(
      z.object({
        entryId: id,
        models: collectionCount,
        built: collectionCount,
        painted: collectionCount,
        wanted: collectionCount,
        countsAs: countsAs.optional(),
      }),
    )
    .min(1)
    .max(MAX_COLLECTION_DATASHEETS),
  replace: z.boolean(),
})
export const favouriteFactionSchema = z.object({ catalogueId: id, favourite: z.boolean() })
export const favouriteDatasheetSchema = z.object({ entryId: id, favourite: z.boolean() })
export const rememberMatchupSchema = recentMatchupSchema.refine((entry) => simulatorPairing(entry.shared) !== null, 'choose both units')
export const forgetMatchupSchema = recentMatchupSchema.pick({ shared: true })
export const setAbilityReminderSchema = abilityReminderSchema
export const removeAbilityReminderSchema = abilityReminderSchema.pick({ key: true })
export const favouriteDetachmentSchema = z.object({ catalogueId: id, detachmentId: detachmentIdSchema, favourite: z.boolean() })
export const terrainReferencesSchema = z.object({
  matchupIds: z.array(slug).min(1).max(2),
  geometryVersion: z.union([z.literal(2), z.literal(3), z.literal(6), z.literal(7), z.literal(8)]).optional(),
})
/** One section of one rules document, which is as much as a rules page reads. */
export const ruleSectionSchema = z.object({ documentId: slug, sectionId: slug })
export const dispositionSchema = z.object({ dispositionId: slug })
/** A faction page addresses its faction by route slug, older links by catalogue id. */
export const factionSchema = z.object({ catalogueId: slug.transform(currentCatalogueId) })

/** Saved rows are read back through these, so a hand-edited one fails loudly. */
export const savedPrepSchema = prepSchema

export const priceSchema = z
  .object({
    includeUnitLimits: z.boolean().optional(),
    catalogueId: id,
    detachmentIds: z.array(detachmentIdSchema).max(DETACHMENTS_MAX),
    disposition: id.nullable(),
    borrowedDetachmentId: detachmentIdSchema.nullable().optional(),
    limit: rosterLimit,
    units: picksSchema,
    waivedRules,
    optionalRules,
  })
  .overwrite(currentRosterIds)

export type PriceInput = z.infer<typeof priceSchema>

/** Exports whatever the builder is showing, so it works before a list is attached. */
export const exportRosterSchema = priceSchema
  .safeExtend({ name: z.string().trim().min(1).max(120), pointsBudget })
  .superRefine(validatePointsBudget)
  .overwrite(withStandardBudget)
export type ExportRosterInput = z.infer<typeof exportRosterSchema>
