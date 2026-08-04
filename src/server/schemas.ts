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
