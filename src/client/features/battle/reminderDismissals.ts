import { z } from 'zod'
import type { Phase } from '../../../core/battle'
import { ROSTER_REMINDERS_MAX } from '../../../core/reminders'
import { parseStored } from '../../storedValue'

const REMINDER_DISMISSAL_SCOPES = ['phase', 'turn', 'round', 'battle'] as const

export type ReminderDismissalScope = (typeof REMINDER_DISMISSAL_SCOPES)[number]

export type ReminderDismissalContext = {
  round: number
  activePlayerId: string | null
  phase: Phase
}

const MAX_DISMISSALS = ROSTER_REMINDERS_MAX * REMINDER_DISMISSAL_SCOPES.length

export const reminderDismissalStorageKey = (battleToken: string) => `praetorium.reminders.${battleToken}`

export function reminderDismissalKey(reminderKey: string, scope: ReminderDismissalScope, context: ReminderDismissalContext): string {
  const prefix = encodeURIComponent(reminderKey)
  if (scope === 'battle') return `${prefix}|battle`
  if (scope === 'round') return `${prefix}|round|${context.round}`

  const turn = `${context.round}|${encodeURIComponent(context.activePlayerId ?? '')}`
  if (scope === 'turn') return `${prefix}|turn|${turn}`
  return `${prefix}|phase|${turn}|${context.phase}`
}

export function reminderDismissalKeys(reminderKey: string, context: ReminderDismissalContext): string[] {
  return REMINDER_DISMISSAL_SCOPES.map((scope) => reminderDismissalKey(reminderKey, scope, context))
}

const dismissalsSchema = z.array(z.string())

export const parseReminderDismissals = (value: string | null) => new Set(parseStored(dismissalsSchema, value)?.slice(-MAX_DISMISSALS))

export const serializeReminderDismissals = (dismissals: ReadonlySet<string>) => JSON.stringify([...dismissals].slice(-MAX_DISMISSALS))

export function pruneReminderDismissals(dismissals: ReadonlySet<string>, context: ReminderDismissalContext): Set<string> {
  const suffixes = reminderDismissalKeys('', context)
  return new Set([...dismissals].filter((key) => suffixes.some((suffix) => key.endsWith(suffix))).slice(-MAX_DISMISSALS))
}
