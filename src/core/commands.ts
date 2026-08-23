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
import { UNIT_GROUPS } from './unitGroups'

const id = z.string().min(1).max(64)
export const rosterPickSchema = z.object({
  entryId: id,
  catalogueId: id.optional(),
  models: z.number().int().min(1).max(60).optional(),
  choices: z.record(z.string().max(400), id).optional(),
  spreads: z.record(z.string().max(400), z.record(z.string().max(64), z.number().int().min(0).max(60))).optional(),
  swaps: z.record(z.string().max(140), z.number().int().min(0).max(60)).optional(),
  toggles: z.record(z.string().max(400), z.number().int().min(0).max(1)).optional(),
  attachedTo: z.number().int().min(0).max(99).optional(),
})
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
    teamBattle: z.boolean().optional(),
    clockLimitMinutes: z.number().int().min(5).max(300).nullable(),
  }),
  z.object({ kind: z.literal('reset-setup') }),
  z.object({ kind: z.literal('set-setup-step'), step: z.number().int().min(0).max(5) }),
  z.object({ kind: z.literal('set-attacker'), attackerId: id }),
  z.object({
    kind: z.literal('attach-roster'),
    prep: battlePrep.nullable().optional(),
    roster: z.object({
      name: z.string().max(ROSTER_NAME_MAX_LENGTH),
      text: z.string().max(ROSTER_MAX_LENGTH),
      id: id.optional(),
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
          detachmentIds: z.array(id).max(3).optional(),
          picks: z.array(rosterPickSchema).max(100).optional(),
          units: z
            .array(
              z.object({
                key: id,
                name: z.string().min(1).max(ROSTER_NAME_MAX_LENGTH),
                points: z.number().int().min(0).max(10_000),
                models: z.number().int().min(0).max(100),
                entryId: id.optional(),
                group: z.enum(UNIT_GROUPS).optional(),
                wargear: z
                  .array(z.object({ name: z.string().min(1).max(ROSTER_NAME_MAX_LENGTH), count: z.number().int().min(1).max(100) }))
                  .max(200)
                  .optional(),
                enhancements: z.array(z.string().min(1).max(ROSTER_NAME_MAX_LENGTH)).max(20).optional(),
                upgrades: z.array(z.string().min(1).max(ROSTER_NAME_MAX_LENGTH)).max(20).optional(),
                joined: z
                  .array(
                    z.object({
                      label: z.string().min(1).max(ROSTER_NAME_MAX_LENGTH),
                      name: z.string().min(1).max(ROSTER_NAME_MAX_LENGTH),
                    }),
                  )
                  .max(20)
                  .optional(),
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
  z.object({ kind: z.literal('set-unit'), unitKey: id, destroyed: z.boolean(), playerId: id.optional() }),
  z.object({
    kind: z.literal('set-prep'),
    ...battlePrep.shape,
  }),
  z.object({ kind: z.literal('deploy-unit'), unitKey: id, deployed: z.boolean(), playerId: id.optional() }),
  z.object({ kind: z.literal('set-unit-formation'), unitKey: id, formation: z.enum(UNIT_FORMATIONS), playerId: id.optional() }),
  z.object({ kind: z.literal('set-painted'), painted: z.boolean(), playerId: id.optional() }),
  z.object({ kind: z.literal('wound-unit'), unitKey: id, delta: z.number().int(), playerId: id.optional() }),
  z.object({ kind: z.literal('set-deployment'), patternId: id.nullable() }),
  z.object({ kind: z.literal('set-battlefield'), patternId: id, terrainLayoutId: id }),
  z.object({
    kind: z.literal('use-stratagem'),
    key: id,
    cp: z.number().int().min(0).max(STRATAGEM_CP_MAX).optional(),
    playerId: id.optional(),
  }),
  z.object({ kind: z.literal('score-secondary'), key: id, delta: z.number().int(), playerId: id.optional() }),
  z.object({
    kind: z.literal('score-settlement'),
    scores: z
      .array(
        z.discriminatedUnion('category', [
          z.object({ category: z.literal('primary'), delta: z.number().int().positive() }),
          z.object({
            category: z.literal('secondary'),
            key: id,
            delta: z.number().int().positive(),
            status: z.literal('achieved').optional(),
          }),
        ]),
      )
      .min(1)
      .max(3),
    playerId: id.optional(),
  }),
  z.object({
    kind: z.literal('set-secondary-status'),
    key: id,
    status: z.enum(['active', 'achieved', 'discarded', 'returned']),
    playerId: id.optional(),
  }),
  z.object({ kind: z.literal('draw-secondary'), secondary }),
  z.object({ kind: z.literal('draw-secondaries'), secondaries: z.array(secondary).min(1).max(2) }),
  z.object({ kind: z.literal('select-secret'), secondary }),
  z.object({ kind: z.literal('reveal-secret'), playerId: id.optional() }),
  z.object({ kind: z.literal('begin-battle'), firstPlayerId: id, attackerId: id.optional() }),
  z.object({ kind: z.literal('adjust-cp'), delta: z.number().int(), playerId: id.optional() }),
  z.object({
    kind: z.literal('resolve-tactical-hand'),
    keys: z.array(id).optional(),
    gainCp: z.boolean().optional(),
    playerId: id.optional(),
  }),
  z.object({ kind: z.literal('score'), category: z.enum(['primary', 'secondary']), delta: z.number().int(), playerId: id.optional() }),
  z.object({ kind: z.literal('correct-player'), playerId: id, resource: z.enum(['cp', 'primary', 'secondary']), delta: z.number().int() }),
  z.object({ kind: z.literal('settle-opponent-turn') }),
  z.object({ kind: z.literal('advance'), playerId: id.optional() }),
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
