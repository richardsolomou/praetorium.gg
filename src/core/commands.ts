import { z } from 'zod'
import { type Command, ROSTER_MAX_LENGTH, ROSTER_NAME_MAX_LENGTH } from './battle'
import type { Selection } from './evaluate'

const id = z.string().min(1).max(64)

/** A chosen entry and what sits under it. Recursive, and bounded so a command cannot be enormous. */
const selectionSchema: z.ZodType<Selection> = z.lazy(() =>
  z.object({
    id,
    count: z.number().int().min(0).max(1000).optional(),
    selections: z.array(selectionSchema).max(200).optional(),
  }),
)

/**
 * The wire and storage contract for a command, in both directions: what a client
 * may send, and what the log is trusted to contain when it is read back. Length
 * limits are the domain's, so a command cannot be stored that `validate` would
 * have refused.
 */
export const commandSchema: z.ZodType<Command> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('attach-roster'),
    roster: z.object({
      name: z.string().max(ROSTER_NAME_MAX_LENGTH),
      text: z.string().max(ROSTER_MAX_LENGTH),
      built: z
        .object({
          catalogueId: id,
          revision: z.string().min(1).max(64),
          limit: z.number().int().min(0).max(10_000),
          selections: z.array(selectionSchema).max(200),
          units: z
            .array(
              z.object({
                key: id,
                name: z.string().min(1).max(ROSTER_NAME_MAX_LENGTH),
                points: z.number().int().min(0).max(10_000),
                models: z.number().int().min(0).max(100),
              }),
            )
            .max(200),
        })
        .optional(),
    }),
  }),
  z.object({ kind: z.literal('set-unit'), unitKey: id, destroyed: z.boolean() }),
  z.object({ kind: z.literal('begin-battle'), firstPlayerId: id }),
  z.object({ kind: z.literal('adjust-cp'), delta: z.number().int() }),
  z.object({ kind: z.literal('score'), category: z.enum(['primary', 'secondary']), delta: z.number().int() }),
  z.object({ kind: z.literal('advance') }),
  z.object({ kind: z.literal('end-battle') }),
  z.object({ kind: z.literal('undo'), target: z.number().int().positive() }),
])
