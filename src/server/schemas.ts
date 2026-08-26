import { z } from 'zod'
import {
  GAME_SIZES,
  PHASES,
  ROSTER_NAME_MAX_LENGTH,
  SECONDARIES_MAX,
  STRATAGEM_CP_MAX,
  STRATAGEM_LIMITS,
  STRATAGEMS_MAX,
} from '../core/battle'
import { commandSchema, rosterPickSchema } from '../core/commands'
import { ROSTER_SOURCES, ROSTER_VISIBILITIES } from '../core/savedRoster'
import {
  LEAGUE_ADMISSIONS,
  LEAGUE_DESCRIPTION_MAX_LENGTH,
  LEAGUE_DEFAULT_ROSTER_LIMIT,
  LEAGUE_EVENT_FORMATS,
  LEAGUE_MEMBER_MAX,
  LEAGUE_MEMBER_MIN,
  LEAGUE_NAME_MAX_LENGTH,
  LEAGUE_TEAM_ROSTER_LIMITS,
  LEAGUE_VISIBILITIES,
} from '../core/league'
import { PASSWORD_MIN_LENGTH, SOCIAL_PROVIDERS } from '../authConfig'

const id = z.string().min(1).max(64)
const token = id
const catalogueId = id
const slug = z.string().min(1).max(160)
const rosterLimit = z.number().int().min(0).max(10_000)
const battlesCursor = z.object({ activity: z.number().int().min(0), id })

export const tokenSchema = z.object({ token })
const leagueFields = {
  name: z.string().trim().min(1, 'name the league').max(LEAGUE_NAME_MAX_LENGTH),
  description: z.string().trim().max(LEAGUE_DESCRIPTION_MAX_LENGTH),
  visibility: z.enum(LEAGUE_VISIBILITIES),
  admission: z.enum(LEAGUE_ADMISSIONS),
  playerLimit: z.number().int().min(LEAGUE_MEMBER_MIN).max(LEAGUE_MEMBER_MAX).nullable(),
}
const leagueEventRuleFields = {
  format: z.enum(LEAGUE_EVENT_FORMATS).default('1v1'),
  rosterLimit: z
    .number()
    .int()
    .refine((value) => GAME_SIZES.some((size) => size.limit === value))
    .default(LEAGUE_DEFAULT_ROSTER_LIMIT),
}
function validateLeagueEventRule(
  value: { format: (typeof LEAGUE_EVENT_FORMATS)[number]; rosterLimit: number; playerLimit?: number | null },
  context: z.RefinementCtx,
) {
  if ((value.format === '2v1' || value.format === '2v2') && !LEAGUE_TEAM_ROSTER_LIMITS.some((limit) => limit === value.rosterLimit)) {
    context.addIssue({ code: 'custom', path: ['rosterLimit'], message: `choose a supported ${value.format} roster size` })
  }
  if (value.format === '2v1' && value.playerLimit !== undefined && value.playerLimit !== null && value.playerLimit < 3) {
    context.addIssue({ code: 'custom', path: ['playerLimit'], message: 'a 2v1 event needs at least three places' })
  }
  if (
    value.format === '2v2' &&
    value.playerLimit !== undefined &&
    value.playerLimit !== null &&
    (value.playerLimit < 4 || value.playerLimit % 2 !== 0)
  ) {
    context.addIssue({ code: 'custom', path: ['playerLimit'], message: 'a 2v2 event needs an even number of at least four places' })
  }
}
export const createLeagueSchema = z
  .object({
    ...leagueFields,
    ...leagueEventRuleFields,
    description: leagueFields.description.default(''),
    playerLimit: leagueFields.playerLimit.default(null),
    recurring: z.boolean().default(false),
  })
  .superRefine(validateLeagueEventRule)
export const updateLeagueSchema = z.object({ token, ...leagueFields })
export const leagueEventSchema = z.object({ token, eventToken: token.optional() })
export const createLeagueEventSchema = z.object({ token, ...leagueEventRuleFields }).superRefine(validateLeagueEventRule)
export const openLeagueSchema = z.object({ token, eventToken: token.optional() })
export const moderateLeagueEntrySchema = z.object({
  token,
  eventToken: token.optional(),
  userId: id,
  status: z.enum(['accepted', 'rejected']),
})
export const submitLeagueRosterSchema = z.object({ token, eventToken: token.optional(), rosterId: id })
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
export const createLeagueBattleSchema = z.object({
  token,
  eventToken: token.optional(),
  opponentId: id,
  allyId: id.optional(),
  secondOpponentId: id.optional(),
  missionPackId: id.nullable().default(null),
})
/** A roster read may name the battle that entitles the reader to it. */
export const rosterInBattleSchema = z.object({ id, battle: token.optional() })
/**
 * Who is in a new battle, and on which side.
 *
 * `allyId` sits with the creator and `opponentIds` face them, so the same 2v1 can be
 * opened by either player of the allied pair. A 2v2 adds one ally and two opponents,
 * and the combined seat count is bounded rather than either side on its own.
 */
export const createBattleSchema = z
  .object({
    opponentId: id.optional(),
    opponentIds: z.array(id).min(1).max(2).optional(),
    allyId: id.optional(),
    limit: z
      .number()
      .int()
      .refine((value) => GAME_SIZES.some((size) => size.limit === value))
      .optional(),
    missionPackId: id.nullable().default(null),
  })
  .refine(
    (value) => (value.allyId ? 1 : 0) + (value.opponentIds?.length ?? (value.opponentId ? 1 : 0)) <= 3,
    'a battle seats four players at most',
  )
  .refine((value) => !value.allyId || Boolean(value.opponentIds?.length || value.opponentId), 'an ally needs someone to play against')
export const deleteBattleSchema = z.object({ token })
export const battlesPageSchema = z.object({
  before: battlesCursor.nullable().default(null),
})
export const userSchema = z.object({ userId: id })
export const friendSchema = z.object({ userId: id })
export const setOwnPasswordSchema = z.object({ password: z.string().min(PASSWORD_MIN_LENGTH).max(128) })
export const unlinkOwnAccountSchema = z.object({ provider: z.enum(['credential', ...SOCIAL_PROVIDERS]) })
export const setAdminRoleSchema = z.object({ userId: id, role: z.enum(['admin', 'user']) })
export const adminUsersSchema = z.object({
  query: z.string().trim().max(100).default(''),
  cursor: z.object({ createdAt: z.coerce.date(), id }).nullable().default(null),
})

/**
 * `expectedSeq` is the client's claim about the history it has already seen.
 * Sending it is what makes a command conditional on nothing having happened since.
 */
const attachSavedRosterSchema = z.object({ kind: z.literal('attach-saved-roster'), rosterId: id, playerId: id.optional() }).strict()
export const submitSchema = z.object({
  token,
  expectedSeq: z.number().int().min(0),
  command: z.union([commandSchema, attachSavedRosterSchema]),
})

export const unitsSchema = z.object({
  catalogueId,
  query: z.string().max(80).default(''),
  battleSize: z
    .number()
    .int()
    .refine((value) => GAME_SIZES.some((size) => size.limit === value))
    .optional(),
})

export const globalSearchSchema = z.object({ query: z.string().trim().min(2).max(80) })

/**
 * A list is sent as the entries the player picked and how many models they want
 * in each; the server expands every one to a legal selection.
 */
const pickSchema = rosterPickSchema

export const datasheetSchema = z.object({
  catalogueId,
  entryId: id,
  detachmentIds: z.array(id).max(3).default([]),
  picks: z.array(pickSchema).max(100).default([]),
  pickIndex: z.number().int().min(0).max(99).nullable().default(null),
  /** Keep weapons the unit is not carrying, so options read as this list would make them. */
  everyWeapon: z.boolean().default(false),
})
export const savedRosterDatasheetSchema = rosterInBattleSchema.extend({ pickIndex: z.number().int().min(0).max(99) })
export const datasheetSlugSchema = z.object({ catalogueId, slug })

/** The datasheets of one army, asked about together because a list is attached in one go. */
export const unitWoundsSchema = z.object({ catalogueId, entryIds: z.array(id).max(200) })

const prepSchema = z.object({
  stratagems: z
    .array(
      z.object({
        key: id,
        name: z.string().min(1).max(ROSTER_NAME_MAX_LENGTH),
        cp: z.number().int().min(0).max(STRATAGEM_CP_MAX),
        limit: z.enum(STRATAGEM_LIMITS),
        phases: z.array(z.enum(PHASES)).max(PHASES.length).optional(),
        turn: z.enum(['your-turn', 'opponent-turn', 'either']).optional(),
      }),
    )
    .max(STRATAGEMS_MAX),
  secondaries: z.array(z.object({ key: id, name: z.string().min(1).max(ROSTER_NAME_MAX_LENGTH) })).max(SECONDARIES_MAX),
})

export const saveRosterSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1, 'name the list').max(ROSTER_NAME_MAX_LENGTH),
  catalogueId,
  detachmentIds: z.array(id).max(3),
  disposition: id.nullable(),
  limit: rosterLimit,
  picks: z.array(pickSchema).max(100),
  prep: prepSchema.nullable(),
  visibility: z.enum(ROSTER_VISIBILITIES).default('private'),
  source: z.enum(ROSTER_SOURCES).default('editable'),
})

/** A `.ros`, base64 `.rosz`, BattleBase, or NewRecruit export. */
export const importRosterSchema = z.object({ file: z.string().min(1).max(4_000_000), name: z.string().max(120).optional() })
export type ImportRosterInput = z.infer<typeof importRosterSchema>

export const detachmentRulesSchema = z.object({
  catalogueId,
  detachmentNames: z.array(z.string().min(1).max(120)).min(1).max(3),
})
export const detachmentDetailSchema = z.object({ catalogueId, slug })

export const rosterIdSchema = z.object({ id })
export const rosterVisibilitySchema = z.object({ id, visibility: z.enum(ROSTER_VISIBILITIES) })

export const ownedSchema = z.object({ entryId: id, owned: z.boolean() })
export const favouriteFactionSchema = z.object({ catalogueId: id, favourite: z.boolean() })
export const favouriteDetachmentSchema = z.object({ catalogueId: id, detachmentId: id, favourite: z.boolean() })
export const terrainReferencesSchema = z.object({ matchupIds: z.array(slug).min(1).max(2) })
/** A faction page addresses its faction by route slug, older links by catalogue id. */
export const factionSchema = z.object({ catalogueId: slug })

/** Saved rows are read back through these, so a hand-edited one fails loudly. */
export const picksSchema = z.array(pickSchema).max(100)
export const savedPrepSchema = prepSchema

export const priceSchema = z.object({
  catalogueId,
  detachmentIds: z.array(id).max(3),
  disposition: id.nullable(),
  limit: rosterLimit,
  units: z.array(pickSchema).max(100),
})

export type PriceInput = z.infer<typeof priceSchema>

/** Exports whatever the builder is showing, so it works before a list is attached. */
export const exportRosterSchema = priceSchema.extend({ name: z.string().trim().min(1).max(120) })
export type ExportRosterInput = z.infer<typeof exportRosterSchema>
