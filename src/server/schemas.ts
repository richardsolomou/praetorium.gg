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
  LEAGUE_MEMBER_MAX,
  LEAGUE_MEMBER_MIN,
  LEAGUE_NAME_MAX_LENGTH,
  LEAGUE_VISIBILITIES,
} from '../core/league'
import { PASSWORD_MIN_LENGTH, SOCIAL_PROVIDERS } from '../authConfig'

const id = z.string().min(1).max(64)
const token = id
const catalogueId = id
const slug = z.string().min(1).max(160)
const rosterLimit = z.number().int().min(0).max(10_000)

export const tokenSchema = z.object({ token })
export const createLeagueSchema = z.object({
  name: z.string().trim().min(1, 'name the league').max(LEAGUE_NAME_MAX_LENGTH),
  description: z.string().trim().max(LEAGUE_DESCRIPTION_MAX_LENGTH).default(''),
  visibility: z.enum(LEAGUE_VISIBILITIES),
  admission: z.enum(LEAGUE_ADMISSIONS),
  playerLimit: z.number().int().min(LEAGUE_MEMBER_MIN).max(LEAGUE_MEMBER_MAX).nullable().default(null),
  recurring: z.boolean().default(false),
})
export const leagueEventSchema = z.object({ token, eventToken: token.optional() })
export const openLeagueSchema = z.object({ token, eventToken: token.optional() })
export const moderateLeagueEntrySchema = z.object({
  token,
  eventToken: token.optional(),
  userId: id,
  status: z.enum(['accepted', 'rejected']),
})
export const submitLeagueRosterSchema = z.object({ token, eventToken: token.optional(), rosterId: id })
export const leagueRosterSchema = z.object({ token, eventToken: token.optional(), userId: id })
export const createLeagueBattleSchema = z.object({
  token,
  eventToken: token.optional(),
  opponentId: id,
  missionPackId: id.nullable().default(null),
})
/** A roster read may name the battle that entitles the reader to it. */
export const rosterInBattleSchema = z.object({ id, battle: token.optional() })
/**
 * Who is in a new battle, and on which side.
 *
 * `allyId` sits with the creator and `opponentIds` face them, so the same 2v1 can be
 * opened by either player of the allied pair. Three seats is the whole table, which
 * is why the two together are capped rather than each on its own.
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
    (value) => (value.allyId ? 1 : 0) + (value.opponentIds?.length ?? (value.opponentId ? 1 : 0)) <= 2,
    'a battle seats three players at most',
  )
  .refine((value) => !value.allyId || Boolean(value.opponentIds?.length || value.opponentId), 'an ally needs someone to play against')
export const deleteBattleSchema = z.object({ token })
export const battlesPageSchema = z.object({
  before: z
    .object({ activity: z.number().int().min(0), id })
    .nullable()
    .default(null),
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
export const submitSchema = z.object({ token, expectedSeq: z.number().int().min(0), command: commandSchema })

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
