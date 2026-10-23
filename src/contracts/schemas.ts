import { ADMIN_USER_ROLES, ADMIN_USER_SORTS } from '../admin'
import { z } from 'zod'
import { REPLAY_BATCH_SIZE } from '../contracts/battles'
import { onboardingTaskIds, tourTaskIds } from '../core/onboarding'
import { PLAYER_SEARCH_MAX_LENGTH } from '../core/playerSearch'
import { MAX_COLLECTION_DATASHEETS, MAX_COLLECTION_MODELS } from '../core/collection'
import { PUSH_PLATFORMS } from '../core/notificationConfig'
import { unitLoadoutNameSchema, unitLoadoutSchema } from '../core/unitLoadouts'
import { pushTokenSchema } from '../core/notifications'
import {
  customPointsBudget,
  FORMAT_RULE_IDS,
  GAME_SIZES,
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
import { rosterReminderSchema, ROSTER_REMINDERS_MAX } from '../core/reminders'
import {
  commandSchema,
  detachmentIdSchema,
  idSchema as id,
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
  LEAGUE_ADMISSIONS,
  LEAGUE_DESCRIPTION_MAX_LENGTH,
  LEAGUE_DEFAULT_ROSTER_LIMIT,
  LEAGUE_ADMIN_MAX,
  LEAGUE_MEMBER_MAX,
  LEAGUE_MEMBER_MIN,
  LEAGUE_NAME_MAX_LENGTH,
  LEAGUE_TEAM_ROSTER_LIMITS,
  LEAGUE_VISIBILITIES,
} from '../core/league'
import { TABLE_SHAPES, type TableShape } from '../core/tableShape'
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
const leagueFields = {
  name: z.string().trim().min(1, 'name the league').max(LEAGUE_NAME_MAX_LENGTH),
  description: z.string().trim().max(LEAGUE_DESCRIPTION_MAX_LENGTH),
  visibility: z.enum(LEAGUE_VISIBILITIES),
  admission: z.enum(LEAGUE_ADMISSIONS),
  playerLimit: z.number().int().min(LEAGUE_MEMBER_MIN).max(LEAGUE_MEMBER_MAX).nullable(),
}
const leagueEventRuleFields = {
  format: z.enum(TABLE_SHAPES).default('1v1'),
  rosterLimit: z
    .number()
    .int()
    .refine((value) => GAME_SIZES.some((size) => size.limit === value))
    .default(LEAGUE_DEFAULT_ROSTER_LIMIT),
}
function validateLeagueEventRule(value: { format: TableShape; rosterLimit: number }, context: z.RefinementCtx) {
  if ((value.format === '2v1' || value.format === '2v2') && !LEAGUE_TEAM_ROSTER_LIMITS.some((limit) => limit === value.rosterLimit)) {
    context.addIssue({ code: 'custom', path: ['rosterLimit'], message: `choose a supported ${value.format} roster size` })
  }
}
export const createLeagueSchema = z
  .object({
    ...leagueFields,
    description: leagueFields.description.default(''),
    playerLimit: leagueFields.playerLimit.default(null),
    ...leagueEventRuleFields,
    ownerPlays: z.boolean().default(false),
  })
  .superRefine(validateLeagueEventRule)
export const updateLeagueSchema = z.object({
  token,
  ...leagueFields,
  rule: z.object(leagueEventRuleFields).superRefine(validateLeagueEventRule).optional(),
})
export const leagueEventSchema = z.object({ token, eventToken: token.optional() })
export const createLeagueEventSchema = z
  .object({ token, ...leagueFields, ...leagueEventRuleFields, ownerPlays: z.boolean().default(false) })
  .superRefine(validateLeagueEventRule)
export const openLeagueSchema = z.object({ token, eventToken: token.optional() })
export const moderateLeagueEntrySchema = z.object({
  token,
  eventToken: token.optional(),
  userId: id,
  status: z.enum(['accepted', 'rejected']),
})
export const addLeagueEntrantsSchema = z.object({
  token,
  eventToken: token.optional(),
  userIds: z.array(id).min(1).max(LEAGUE_MEMBER_MAX),
})
export const admitLeagueEntriesSchema = z.object({
  token,
  eventToken: token.optional(),
  userIds: z.array(id).min(1).max(LEAGUE_MEMBER_MAX),
})
export const submitLeagueRosterSchema = z.object({ token, eventToken: token.optional(), rosterId: id })
export const setLeagueTeamDispositionSchema = z.object({ token, eventToken: token.optional(), disposition: z.string().min(1).max(64) })
export const assignLeagueRosterRequirementSchema = z.object({
  token,
  eventToken: token.optional(),
  userId: id,
  requiredLimit: z.number().int(),
})
export const assignLeagueTeamSchema = z.object({
  token,
  eventToken: token.optional(),
  userIds: z
    .array(id)
    .min(1)
    .max(2)
    .refine((ids) => new Set(ids).size === ids.length, 'choose different entrants'),
})
export const leagueRosterSchema = z.object({ token, eventToken: token.optional(), userId: id })
export const leagueBattlesSchema = z.object({ token, eventToken: token, before: battlesCursor.nullable().default(null) })
export const leagueResultsSchema = z.object({ token, eventToken: token })
export const setLeagueAdminsSchema = z.object({ token, userIds: z.array(id).max(LEAGUE_ADMIN_MAX) })
export const createLeagueBattleSchema = z.object({
  token,
  eventToken: token.optional(),
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
    limit: z
      .number()
      .int()
      .refine((value) => GAME_SIZES.some((size) => size.limit === value))
      .nullable()
      .optional(),
    guestNames: z.array(z.string().trim().min(1).max(PROFILE_NAME_MAX_LENGTH)).min(1).max(2).optional(),
    missionPackId: id.nullable().default(null),
    casual: z.boolean().default(false),
    manual: z.boolean().default(false),
  })
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
 * `expectedSeq` is the client's claim about the history it has already seen.
 * Sending it is what makes a command conditional on nothing having happened since.
 */
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

export const unitsSchema = z.object({
  catalogueId,
  detachmentIds: z.array(detachmentIdSchema).max(DETACHMENTS_MAX).optional(),
  query: z.string().max(80).default(''),
  battleSize: z
    .number()
    .int()
    .refine((value) => GAME_SIZES.some((size) => size.limit === value) || isKotcLimit(value))
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
    picks: z.array(rosterPickSchema).max(100).default([]),
    pickIndex: z.number().int().min(0).max(99).nullable().default(null),
    /** Keep weapons the unit is not carrying, so options read as this list would make them. */
    everyWeapon: z.boolean().default(false),
  })
  .overwrite((data) => {
    const roster = currentRosterIds(data)
    return { ...roster, entryId: currentEntryId(data.entryId, roster.catalogueId) }
  })
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
  secondaries: z.array(z.object({ key: id, name: z.string().min(1).max(ROSTER_NAME_MAX_LENGTH) })).max(SECONDARIES_MAX),
  reminders: z.array(rosterReminderSchema).max(ROSTER_REMINDERS_MAX).default([]),
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
    picks: z.array(rosterPickSchema).max(100),
    waivedRules,
    optionalRules,
    prep: prepSchema.nullable(),
    visibility: z.enum(ROSTER_VISIBILITIES).default('private'),
    source: z.enum(ROSTER_SOURCES).default('editable'),
  })
  .superRefine(validatePointsBudget)
  .overwrite((value) => withStandardBudget(currentRosterIds(value)))

const attachSavedRosterSchema = z.object({ kind: z.literal('attach-saved-roster'), rosterId: id, playerId: id.optional() }).strict()
/** A guest has no saved lists, so they field the one this device is building, priced and frozen by the server. */
const attachDraftRosterSchema = z.object({ kind: z.literal('attach-draft-roster'), draft: saveRosterSchema }).strict()
export const submitSchema = z.object({
  token,
  expectedSeq: z.number().int().min(0),
  command: z.union([commandSchema, attachSavedRosterSchema, attachDraftRosterSchema]),
})

/** A Praetorium, BattleBase or New Recruit text export, which no roster comes close to filling. */
export const importRosterSchema = z.object({ file: z.string().min(1).max(200_000) })
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
export const collectionModelsSchema = z.object({ entryId: id, models: z.number().int().min(1).max(MAX_COLLECTION_MODELS) })
const collectionCount = z.number().int().min(0).max(MAX_COLLECTION_MODELS)
export const collectionProgressSchema = z
  .object({ entryId: id, built: collectionCount, painted: collectionCount })
  .refine((input) => input.painted <= input.built, 'Painted models must be built')
export const collectionWantedSchema = z.object({ entryId: id, wanted: collectionCount })
export const collectionImportSchema = z.object({
  rows: z
    .array(z.object({ entryId: id, models: collectionCount, built: collectionCount, painted: collectionCount, wanted: collectionCount }))
    .min(1)
    .max(MAX_COLLECTION_DATASHEETS),
  replace: z.boolean(),
})
export const favouriteFactionSchema = z.object({ catalogueId: id, favourite: z.boolean() })
export const favouriteDatasheetSchema = z.object({ entryId: id, favourite: z.boolean() })
export const rememberMatchupSchema = recentMatchupSchema.refine((entry) => simulatorPairing(entry.shared) !== null, 'choose both units')
export const forgetMatchupSchema = recentMatchupSchema.pick({ shared: true })
export const favouriteDetachmentSchema = z.object({ catalogueId: id, detachmentId: detachmentIdSchema, favourite: z.boolean() })
export const terrainReferencesSchema = z.object({
  matchupIds: z.array(slug).min(1).max(2),
  geometryVersion: z.union([z.literal(2), z.literal(3), z.literal(6), z.literal(7)]).optional(),
})
/** One section of one rules document, which is as much as a rules page reads. */
export const ruleSectionSchema = z.object({ documentId: slug, sectionId: slug })
export const dispositionSchema = z.object({ dispositionId: slug })
/** A faction page addresses its faction by route slug, older links by catalogue id. */
export const factionSchema = z.object({ catalogueId: slug.transform(currentCatalogueId) })

/** Saved rows are read back through these, so a hand-edited one fails loudly. */
export const picksSchema = z.array(rosterPickSchema).max(100)
export const savedPrepSchema = prepSchema

export const priceSchema = z
  .object({
    includeUnitLimits: z.boolean().optional(),
    catalogueId: id,
    detachmentIds: z.array(detachmentIdSchema).max(DETACHMENTS_MAX),
    disposition: id.nullable(),
    borrowedDetachmentId: detachmentIdSchema.nullable().optional(),
    limit: rosterLimit,
    units: z.array(rosterPickSchema).max(100),
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
