import { z } from 'zod'
import { PHASES, type Phase } from '../../../core/battle'
import { parseStored } from '../../storedValue'
import type { ReminderDismissalContext } from './reminderDismissals'

/** A moment of the battle as this device last showed it; `order` counts turns from the first, so later turns sort after. */
export type SeenMoment = ReminderDismissalContext & { turn: 'your-turn' | 'opponent-turn'; order: number }

const seenMomentSchema = z.object({
  round: z.number().int(),
  activePlayerId: z.string().nullable(),
  phase: z.enum(PHASES),
  turn: z.enum(['your-turn', 'opponent-turn']),
  order: z.number().int(),
})

export const reminderMomentStorageKey = (battleToken: string) => `praetorium.reminder-moment.${battleToken}`

export const parseSeenMoment = (value: string | null): SeenMoment | null => parseStored(seenMomentSchema, value) ?? null

export const sameSeenMoment = (left: SeenMoment, right: SeenMoment) =>
  left.order === right.order && left.activePlayerId === right.activePlayerId && left.phase === right.phase && left.turn === right.turn

const phasesBetween = (from: Phase, to?: Phase) => PHASES.slice(PHASES.indexOf(from), to && PHASES.indexOf(to))

/**
 * The moments a battle passed through between two, oldest first, from `previous` up to but not including `current`.
 * Only the previous turn's and this turn's count: a device away for longer gets this turn's alone, and an undone
 * moment passes nothing.
 */
export function passedMoments(previous: SeenMoment, current: SeenMoment): SeenMoment[] {
  if (current.order < previous.order) return []
  if (current.order === previous.order) return phasesBetween(previous.phase, current.phase).map((phase) => ({ ...previous, phase }))
  return [
    ...(current.order === previous.order + 1 ? phasesBetween(previous.phase).map((phase) => ({ ...previous, phase })) : []),
    ...phasesBetween('command', current.phase).map((phase) => ({ ...current, phase })),
  ]
}
