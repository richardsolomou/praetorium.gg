import { z } from 'zod'

export const MAX_WATCH_MESSAGE_BYTES = 48_000
export const WATCH_FRESHNESS_MS = 45_000

const shortText = z.string().max(160)
export const watchBattleSchema = z.object({
  version: z.literal(1),
  battleId: shortText,
  viewerId: shortText,
  seq: z.number().int().nonnegative(),
  updatedAt: z.number().nonnegative(),
  round: z.number().int().nonnegative(),
  rounds: z.number().int().positive(),
  phase: z.enum(['command', 'movement', 'shooting', 'charge', 'fight', 'end']),
  activeSide: z.number().int().nullable(),
  paused: z.boolean(),
  turnElapsedMs: z.number().nonnegative(),
  turnRunning: z.boolean(),
  sides: z
    .array(
      z.object({
        index: z.number().int(),
        name: shortText,
        yours: z.boolean(),
        vp: z.number().int().min(0).max(1_000_000),
        cp: z.number().int().min(0).max(1_000_000),
      }),
    )
    .max(2),
  objectives: z
    .array(
      z.object({
        id: shortText,
        name: shortText,
        kind: z.enum(['Primary', 'Secondary', 'Secret']),
        points: z.number().int().min(0).max(1_000_000),
        summary: z.string().max(1800),
      }),
    )
    .max(10),
  reminders: z
    .array(
      z.object({
        id: z.string().max(500),
        title: shortText,
        unit: shortText.nullable(),
        moment: shortText,
        description: z.string().max(500),
      }),
    )
    .max(20),
  moreReminders: z.number().int().nonnegative(),
})

export type WatchBattle = z.infer<typeof watchBattleSchema>

export function parseWatchBattle(value: unknown): WatchBattle | null {
  const parsed = watchBattleSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
