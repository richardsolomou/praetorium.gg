import { z } from 'zod'
import { PLAYER_NAME_MAX_LENGTH } from '../core/battle'
import { commandSchema } from '../core/commands'

const token = z.string().min(1).max(64)
const name = z.string().trim().min(1, 'say who you are').max(PLAYER_NAME_MAX_LENGTH)

export const createBattleSchema = z.object({ name })

export const tokenSchema = z.object({ token })

export const joinBattleSchema = z.object({ token, name })

/**
 * `expectedSeq` is the client's claim about the history it has already seen.
 * Sending it is what makes a command conditional on nothing having happened since.
 */
export const submitSchema = z.object({ token, expectedSeq: z.number().int().min(0), command: commandSchema })

const catalogueId = z.string().min(1).max(64)

export const unitsSchema = z.object({ catalogueId, query: z.string().max(80).default('') })

/**
 * A list is sent as the entries the player picked and how many models they want
 * in each; the server expands every one to a legal selection.
 */
const pickSchema = z.object({
  entryId: z.string().min(1).max(64),
  models: z.number().int().min(1).max(60).optional(),
  choices: z.record(z.string().max(400), z.string().min(1).max(64)).optional(),
})

const prepSchema = z.object({
  stratagems: z
    .array(
      z.object({
        key: z.string().min(1).max(64),
        name: z.string().min(1).max(80),
        cp: z.number().int().min(0).max(6),
        limit: z.enum(['phase', 'turn', 'battle', 'unlimited']),
      }),
    )
    .max(12),
  secondaries: z.array(z.object({ key: z.string().min(1).max(64), name: z.string().min(1).max(80) })).max(6),
})

export const saveRosterSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  name: z.string().trim().min(1, 'name the list').max(80),
  catalogueId,
  detachmentId: z.string().min(1).max(64).nullable(),
  limit: z.number().int().min(0).max(10_000),
  picks: z.array(pickSchema).max(100),
  prep: prepSchema.nullable(),
})

export const rosterIdSchema = z.object({ id: z.string().min(1).max(64) })

/** Saved rows are read back through these, so a hand-edited one fails loudly. */
export const picksSchema = z.array(pickSchema).max(100)
export const savedPrepSchema = prepSchema

export const priceSchema = z.object({
  catalogueId,
  detachmentId: z.string().min(1).max(64).optional(),
  units: z
    .array(
      z.object({
        entryId: z.string().min(1).max(64),
        models: z.number().int().min(1).max(60).optional(),
        /** Group path to chosen option, as `unitChoices` reports it. */
        choices: z.record(z.string().max(400), z.string().min(1).max(64)).optional(),
      }),
    )
    .max(100),
})
