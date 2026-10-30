import {
  abilityReminderFits,
  abilityReminderSchema,
  abilityRemindersFromRosters,
  type AbilityReminder,
  type RosterReminder,
} from '../../../core/reminders'
import { abilityReminders, setAbilityReminder } from '../../functions'
import { parseStored, readStoredValue, writeStoredValue } from '../../storedValue'

/** A visitor's ability alerts, kept in this browser as an account keeps a player's. */
export const VISITOR_REMINDERS_KEY = 'praetorium.ability-reminders'

export const parseVisitorReminders = (stored: string | null): AbilityReminder[] | null => parseStored(abilityReminderSchema.array(), stored)

/** An empty list is stored too, so a visitor who removed every alert never adopts their draft's old ones again. */
export const writeVisitorReminders = (reminders: readonly AbilityReminder[]) =>
  writeStoredValue(VISITOR_REMINDERS_KEY, JSON.stringify(reminders))

const visitorReminders = () => parseVisitorReminders(readStoredValue(VISITOR_REMINDERS_KEY))

/** Moves the per-unit alerts an older build kept in the visitor's list into this browser's alerts, unless it keeps some already. */
export function adoptVisitorReminders(legacy: readonly RosterReminder[] | undefined) {
  if (!legacy?.length || visitorReminders()) return
  writeVisitorReminders(abilityRemindersFromRosters([{ updatedAt: 0, reminders: legacy }]))
}

/** The alerts a visitor's list fields with, or none for the server to read from the draft when this browser keeps none. */
export function visitorFieldingReminders(legacy: readonly RosterReminder[] | undefined) {
  adoptVisitorReminders(legacy)
  return visitorReminders() ?? undefined
}

/**
 * Gives the account that saved a visitor's list the alerts this browser kept, without replacing ones it holds. Never
 * fails that save: it stops at the limit or the first refusal and keeps what it did not send in this browser.
 */
export async function claimVisitorReminders() {
  const kept = visitorReminders()
  if (!kept?.length) return
  const held = await abilityReminders().catch(() => null)
  if (!held) return
  const keys = held.map((reminder) => ({ key: reminder.key }))
  const unsent = kept.filter((reminder) => !keys.some(({ key }) => key === reminder.key))
  while (unsent[0] && abilityReminderFits(keys, unsent[0].key)) {
    const sent = await setAbilityReminder({ data: unsent[0] }).then(
      () => true,
      () => false,
    )
    if (!sent) break
    keys.push({ key: unsent[0].key })
    unsent.shift()
  }
  writeVisitorReminders(unsent)
}
