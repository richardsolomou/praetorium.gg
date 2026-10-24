import { useQuery } from '@tanstack/react-query'
import { abilityReminderFits, withAbilityReminder, type AbilityReminder } from '../../../core/reminders'
import { removeAbilityReminder, setAbilityReminder } from '../../functions'
import { useOptimisticList } from '../../optimisticList'
import { abilityRemindersKey, abilityRemindersQuery } from '../../queries'
import { useStoredValue } from '../../storedValue'
import { parseVisitorReminders, VISITOR_REMINDERS_KEY, writeVisitorReminders } from './visitorReminders'

const NONE: AbilityReminder[] = []

type Change = { save: AbilityReminder } | { remove: string }

const applied = (settings: AbilityReminder[], change: Change) =>
  'save' in change ? withAbilityReminder(settings, change.save) : settings.filter((reminder) => reminder.key !== change.remove)

/** The player's ability alerts: their account's once signed in, otherwise this browser's. */
export function useAbilityReminders(visitor: boolean) {
  const account = useQuery({ ...abilityRemindersQuery(), enabled: !visitor })
  const browser = parseVisitorReminders(useStoredValue(VISITOR_REMINDERS_KEY)) ?? NONE
  const settings = visitor ? browser : (account.data ?? NONE)
  const change = useOptimisticList<AbilityReminder, Change>(
    abilityRemindersKey(),
    (input) => ('save' in input ? setAbilityReminder({ data: input.save }) : removeAbilityReminder({ data: { key: input.remove } })),
    applied,
  )
  /** Settles once the change is kept; an account's refusal rejects and stays in `error`. */
  const apply = async (input: Change) => {
    if (visitor) writeVisitorReminders(applied(browser, input))
    else await change.mutateAsync(input)
  }
  return {
    settings,
    pending: change.isPending,
    error: change.error,
    reset: change.reset,
    /** Whether an alert for this ability fits within the limit, counting one the player holds as a change. */
    fits: (key: string) => abilityReminderFits(settings, key),
    save: (reminder: AbilityReminder) => apply({ save: reminder }),
    remove: (key: string) => apply({ remove: key }),
  }
}
