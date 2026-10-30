import { z } from 'zod'
import { PHASES } from '../core/battle'
import { clockMs, runsIn, type BattleClock } from '../core/battleClock'
import type { BattleView } from '../core/battleView'

export const MAX_WATCH_MESSAGE_BYTES = 48_000

const shortText = z.string().max(160)
const watchBattleSchema = z.object({
  version: z.literal(1),
  battleId: shortText,
  viewerId: shortText,
  seq: z.number().int().nonnegative(),
  updatedAt: z.number().nonnegative(),
  /** Where the watch polls `watchLive` while the phone is away; an older shell strips it and the watch only listens. */
  liveUrl: z
    .url({ protocol: /^https?$/ })
    .max(500)
    .optional(),
  status: z.enum(['setup', 'playing', 'finished']).optional(),
  round: z.number().int().nonnegative(),
  rounds: z.number().int().positive(),
  phase: z.enum(PHASES),
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

/**
 * The part of a watch snapshot anyone who may watch the battle can read: no names, cards or reminders.
 * The phone and the live endpoint both build it here, so the two agree on what a side has scored.
 */
export function watchLive(view: BattleView, clock: BattleClock, now: number) {
  // Every seat on a side carries the side's folded score and CP, so the first seat stands for it.
  const captains = view.players
    .filter((player, index) => view.players.findIndex((other) => other.side === player.side) === index)
    .toSorted((left, right) => left.side - right.side)
  const active = captains.find((captain) => captain.isActive)
  const turn = active ? { side: active.side, round: view.round } : null
  return {
    seq: view.seq,
    updatedAt: now,
    status: view.status,
    round: view.round,
    rounds: view.rounds,
    phase: view.phase,
    activeSide: active?.side ?? null,
    paused: clock.paused,
    turnElapsedMs: turn ? clockMs(clock, now, turn) : 0,
    turnRunning: Boolean(turn && runsIn(clock, turn)),
    sides: captains.map((captain) => ({ index: captain.side, vp: captain.total, cp: captain.cp })),
  }
}
