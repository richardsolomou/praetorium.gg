import type { Phase } from '../core/battle'

export const REMINDER_DISMISSAL_SCOPES = ['phase', 'turn', 'round', 'battle'] as const

export type ReminderDismissalScope = (typeof REMINDER_DISMISSAL_SCOPES)[number]

export type ReminderDismissalContext = {
  round: number
  activePlayerId: string | null
  phase: Phase
}

export function reminderDismissalKey(
  battleToken: string,
  reminderKey: string,
  scope: ReminderDismissalScope,
  context: ReminderDismissalContext,
): string {
  const prefix = `praetorium.reminder.${battleToken}.${encodeURIComponent(reminderKey)}`
  if (scope === 'battle') return `${prefix}.battle`
  if (scope === 'round') return `${prefix}.round.${context.round}`

  const turn = `${context.round}.${context.activePlayerId ?? ''}`
  if (scope === 'turn') return `${prefix}.turn.${turn}`
  return `${prefix}.phase.${turn}.${context.phase}`
}

export function reminderDismissalKeys(battleToken: string, reminderKey: string, context: ReminderDismissalContext): string[] {
  return REMINDER_DISMISSAL_SCOPES.map((scope) => reminderDismissalKey(battleToken, reminderKey, scope, context))
}
