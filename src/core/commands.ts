import { z } from 'zod'
import {
  type Command,
  ROSTER_MAX_LENGTH,
  ROSTER_NAME_MAX_LENGTH,
  SECONDARIES_MAX,
  SECONDARY_MODES,
  STRATAGEM_CP_MAX,
  STRATAGEM_LIMITS,
  STRATAGEMS_MAX,
  UNIT_FORMATIONS,
} from './battle'
import type { Selection } from './evaluate'

const id = z.string().min(1).max(64)
const phase = z.enum(['command', 'movement', 'shooting', 'charge', 'fight', 'end'])
const secondary = z.object({ key: id, name: z.string().min(1).max(ROSTER_NAME_MAX_LENGTH) })
const stratagem = z.object({
  key: id,
  name: z.string().min(1).max(ROSTER_NAME_MAX_LENGTH),
  cp: z.number().int().min(0).max(STRATAGEM_CP_MAX),
  limit: z.enum(STRATAGEM_LIMITS),
  phases: z.array(phase).max(6).optional(),
  turn: z.enum(['your-turn', 'opponent-turn', 'either']).optional(),
})
const battlePrep = z.object({
  stratagems: z.array(stratagem).max(STRATAGEMS_MAX),
  secondaries: z.array(secondary).max(SECONDARIES_MAX),
  secondaryDeck: z.array(secondary).max(60).optional(),
  primary: secondary.nullable(),
  secondaryMode: z.enum(SECONDARY_MODES),
})

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
    kind: z.literal('configure-battle'),
    limit: z.number().int().min(0).max(10_000),
    missionPackId: id.nullable(),
    terrainLayoutId: id.nullable(),
    twistId: id.nullable(),
    solo: z.boolean(),
    clockLimitMinutes: z.number().int().min(5).max(300).nullable(),
  }),
  z.object({ kind: z.literal('reset-setup') }),
  z.object({
    kind: z.literal('attach-roster'),
    prep: battlePrep.nullable().optional(),
    roster: z.object({
      name: z.string().max(ROSTER_NAME_MAX_LENGTH),
      text: z.string().max(ROSTER_MAX_LENGTH),
      built: z
        .object({
          catalogueId: id,
          revision: id,
          limit: z.number().int().min(0).max(10_000),
          detachment: z.string().max(ROSTER_NAME_MAX_LENGTH).nullable(),
          detachments: z
            .array(z.object({ name: z.string().max(ROSTER_NAME_MAX_LENGTH), points: z.number().int().min(1).max(3).nullable() }))
            .max(3)
            .optional(),
          detachmentPointBudget: z.number().int().min(0).max(3).nullable().optional(),
          disposition: z.string().max(64).nullable(),
          selections: z.array(selectionSchema).max(200),
          units: z
            .array(
              z.object({
                key: id,
                name: z.string().min(1).max(ROSTER_NAME_MAX_LENGTH),
                points: z.number().int().min(0).max(10_000),
                models: z.number().int().min(0).max(100),
                formationOptions: z.array(z.enum(UNIT_FORMATIONS)).max(4).optional(),
                prebattleRules: z
                  .array(z.enum(['infiltrators', 'scouts']))
                  .max(2)
                  .optional(),
              }),
            )
            .max(200),
        })
        .optional(),
    }),
  }),
  z.object({ kind: z.literal('set-unit'), unitKey: id, destroyed: z.boolean() }),
  z.object({
    kind: z.literal('set-prep'),
    ...battlePrep.shape,
  }),
  z.object({ kind: z.literal('deploy-unit'), unitKey: id, deployed: z.boolean() }),
  z.object({ kind: z.literal('set-unit-formation'), unitKey: id, formation: z.enum(UNIT_FORMATIONS) }),
  z.object({ kind: z.literal('set-painted'), painted: z.boolean() }),
  z.object({ kind: z.literal('wound-unit'), unitKey: id, delta: z.number().int() }),
  z.object({ kind: z.literal('set-deployment'), patternId: id.nullable() }),
  z.object({ kind: z.literal('set-battlefield'), patternId: id, terrainLayoutId: id }),
  z.object({ kind: z.literal('use-stratagem'), key: id, cp: z.number().int().min(0).max(STRATAGEM_CP_MAX).optional() }),
  z.object({ kind: z.literal('score-secondary'), key: id, delta: z.number().int() }),
  z.object({ kind: z.literal('set-secondary-status'), key: id, status: z.enum(['active', 'achieved', 'discarded']) }),
  z.object({ kind: z.literal('draw-secondary'), secondary }),
  z.object({ kind: z.literal('select-secret'), secondary }),
  z.object({ kind: z.literal('reveal-secret') }),
  z.object({ kind: z.literal('begin-battle'), firstPlayerId: id, attackerId: id.optional() }),
  z.object({ kind: z.literal('adjust-cp'), delta: z.number().int() }),
  z.object({ kind: z.literal('score'), category: z.enum(['primary', 'secondary']), delta: z.number().int() }),
  z.object({ kind: z.literal('correct-player'), playerId: id, resource: z.enum(['cp', 'primary', 'secondary']), delta: z.number().int() }),
  z.object({ kind: z.literal('advance') }),
  z.object({ kind: z.literal('pause-clock') }),
  z.object({ kind: z.literal('resume-clock') }),
  z.object({
    kind: z.literal('end-battle'),
    reason: z.enum(['completed', 'finished-early', 'conceded']).optional(),
    concededBy: id.optional(),
  }),
  z.object({ kind: z.literal('reopen-battle') }),
  z.object({ kind: z.literal('undo'), target: z.number().int().positive() }),
])
