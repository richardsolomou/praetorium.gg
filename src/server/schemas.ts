import { z } from 'zod'
import { ROSTER_NAME_MAX_LENGTH, SECONDARIES_MAX, STRATAGEM_CP_MAX, STRATAGEM_LIMITS, STRATAGEMS_MAX } from '../core/battle'
import { commandSchema } from '../core/commands'

const id = z.string().min(1).max(64)
const token = id
const catalogueId = id
const slug = z.string().min(1).max(160)
const rosterLimit = z.number().int().min(0).max(10_000)

export const tokenSchema = z.object({ token })
export const createBattleSchema = z.object({ opponentId: id })

export const joinBattleSchema = tokenSchema

/**
 * `expectedSeq` is the client's claim about the history it has already seen.
 * Sending it is what makes a command conditional on nothing having happened since.
 */
export const submitSchema = z.object({ token, expectedSeq: z.number().int().min(0), command: commandSchema })

export const unitsSchema = z.object({
  catalogueId,
  query: z.string().max(80).default(''),
})

/**
 * A list is sent as the entries the player picked and how many models they want
 * in each; the server expands every one to a legal selection.
 */
const pickSchema = z.object({
  entryId: id,
  catalogueId: id.optional(),
  models: z.number().int().min(1).max(60).optional(),
  choices: z.record(z.string().max(400), id).optional(),
  /**
   * Group path to how many of each option it holds, for groups holding more than
   * one — a squad splitting its weapons between two.
   */
  spreads: z.record(z.string().max(400), z.record(z.string().max(64), z.number().int().min(0).max(60))).optional(),
  toggles: z.record(z.string().max(400), z.number().int().min(0).max(1)).optional(),
  /**
   * The position of the unit this one is attached to, when it is.
   *
   * A position rather than an id, because the same datasheet may be in the list
   * twice and a character joins one of them, not both. It is only ever read back
   * beside the picks it was saved with.
   */
  attachedTo: z.number().int().min(0).max(99).optional(),
})

export const datasheetSchema = z.object({
  catalogueId,
  entryId: id,
  detachmentIds: z.array(id).max(3).default([]),
  picks: z.array(pickSchema).max(100).default([]),
  pickIndex: z.number().int().min(0).max(99).nullable().default(null),
})
export const datasheetSlugSchema = z.object({ catalogueId, slug })

const prepSchema = z.object({
  stratagems: z
    .array(
      z.object({
        key: id,
        name: z.string().min(1).max(ROSTER_NAME_MAX_LENGTH),
        cp: z.number().int().min(0).max(STRATAGEM_CP_MAX),
        limit: z.enum(STRATAGEM_LIMITS),
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
})

/** A `.ros`, base64 `.rosz`, or BattleBase plain-text export. */
export const importRosterSchema = z.object({ file: z.string().min(1).max(4_000_000), name: z.string().max(120).optional() })
export type ImportRosterInput = z.infer<typeof importRosterSchema>

export const detachmentRulesSchema = z.object({
  catalogueId,
  detachmentNames: z.array(z.string().min(1).max(120)).min(1).max(3),
})
export const detachmentDetailSchema = z.object({ catalogueId, slug })

export const rosterIdSchema = z.object({ id })

export const ownedSchema = z.object({ entryId: id, owned: z.boolean() })

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
