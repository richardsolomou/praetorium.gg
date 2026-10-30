import { z } from 'zod'
import { catalogueEditionSummarySchema } from '../core/catalogueEdition'

const time = z.number().int().nonnegative()

/** A finished battle as `battle_results` holds it: what the leaderboard and achievements need, without folding its log. */
export const battleResultSchema = z.object({
  token: z.string(),
  playerIds: z.array(z.string()),
  sides: z.array(z.number().int()),
  scores: z.array(z.number()),
  concededBy: z.string().nullable(),
  manual: z.boolean(),
  /** The catalogue list each seat brought, so its army is named from whichever catalogue reads it. */
  built: z.array(
    z
      .object({ catalogueId: z.string(), edition: catalogueEditionSummarySchema.pick({ id: true, name: true, status: true }).optional() })
      .nullable(),
  ),
})
export type BattleResult = z.infer<typeof battleResultSchema>

export const storedBattleResultSchema = z.object({ battleId: z.string(), finishedAt: time, result: z.string() })

/** One seat's standing in one table after a battle: `table` is '' overall, or an army's slug. */
export const standingStepSchema = z.object({
  table: z.string(),
  playerId: z.string(),
  battleId: z.string(),
  finishedAt: time,
  mu: z.number(),
  sigma: z.number(),
  rating: z.number().int(),
  battles: z.number().int().nonnegative(),
  won: z.number().int().nonnegative(),
  lost: z.number().int().nonnegative(),
  drawn: z.number().int().nonnegative(),
  points: z.number(),
})
export type StandingStep = z.infer<typeof standingStepSchema> & { change: number }

const standingRowSchema = z.object({
  id: z.string(),
  rating: z.number().int(),
  battles: z.number().int().nonnegative(),
  won: z.number().int().nonnegative(),
  lost: z.number().int().nonnegative(),
  drawn: z.number().int().nonnegative(),
  points: z.number(),
  lastPlayed: time,
})

export const leaderboardSchema = z.array(
  z.object({
    table: z.string(),
    seats: z.number().int().nonnegative(),
    players: z.number().int().nonnegative(),
    rows: z.array(standingRowSchema),
  }),
)

export const playerStandingsSchema = z.object({
  places: z.array(
    z.object({ table: z.string(), place: z.number().int().positive(), of: z.number().int().positive(), standing: standingRowSchema }),
  ),
  history: z.array(z.object({ at: time, rating: z.number().int() })),
})
