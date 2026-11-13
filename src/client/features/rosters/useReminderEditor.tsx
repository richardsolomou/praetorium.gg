import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  armyReminder,
  fieldedReminders,
  reminderKey,
  reminderTimingCountsByUnit,
  suggestReminderTimings,
  suggestReminderWhileDestroyed,
  type ReminderSubject,
} from '../../../core/reminders'
import type { RosterPick } from '../../../core/roster'
import { reminderAbilitiesQuery } from '../../queries'
import { loadedWords } from '../../sourceText'
import { ReminderEditorDialog, type ReminderDraft } from './ReminderEditorDialog'
import type { useAbilityReminders } from './useAbilityReminders'
import type { useRosterPrice } from './useRosterPrice'

/**
 * The ability reminders a player sets from a unit's loadout or datasheet, and how many
 * each card on the roster carries.
 */
export function useReminderEditor({
  abilityAlerts,
  editable,
  catalogueId,
  detachmentIds,
  positioned,
  units,
}: {
  abilityAlerts: ReturnType<typeof useAbilityReminders>
  editable: boolean
  catalogueId: string
  detachmentIds: string[]
  positioned: readonly RosterPick[]
  units: ReturnType<typeof useRosterPrice>['units']
}) {
  const [reminderDraft, setReminderDraft] = useState<ReminderDraft | null>(null)
  const resetAbilityAlert = abilityAlerts.reset
  const controls = {
    active: (subject: ReminderSubject) => abilityAlerts.settings.some((reminder) => reminder.key === reminderKey(subject)),
    onSelect: (subject: ReminderSubject) => {
      const key = reminderKey(subject)
      const description = loadedWords(subject.description ?? '') ?? ''
      const suggested = subject.reminder ?? {
        timings: suggestReminderTimings(description),
        ...(suggestReminderWhileDestroyed(description) ? { whileDestroyed: true as const } : {}),
      }
      resetAbilityAlert()
      setReminderDraft(
        abilityAlerts.settings.find((reminder) => reminder.key === key) ?? {
          key,
          ability: subject.name,
          description: subject.description ?? '',
          timings: suggested.timings,
          ...(!armyReminder(subject) && suggested.whileDestroyed ? { whileDestroyed: true } : {}),
        },
      )
    },
  }
  const { data: reminderAbilities } = useQuery({
    ...reminderAbilitiesQuery(catalogueId, detachmentIds, positioned),
    enabled: editable && abilityAlerts.settings.length > 0 && Boolean(catalogueId && positioned.length),
  })
  const countsByUnit = useMemo(
    () => reminderTimingCountsByUnit(fieldedReminders(abilityAlerts.settings, { detachmentIds, units }, reminderAbilities ?? [])),
    [abilityAlerts.settings, detachmentIds, reminderAbilities, units],
  )
  const dialog = reminderDraft ? (
    <ReminderEditorDialog
      key={reminderDraft.key}
      draft={reminderDraft}
      full={!abilityAlerts.fits(reminderDraft.key)}
      error={abilityAlerts.error}
      onClose={() => setReminderDraft(null)}
      onSave={(reminder) =>
        void abilityAlerts.save(reminder).then(
          () => setReminderDraft(null),
          () => {},
        )
      }
      onRemove={
        abilityAlerts.settings.some((reminder) => reminder.key === reminderDraft.key)
          ? () =>
              void abilityAlerts.remove(reminderDraft.key).then(
                () => setReminderDraft(null),
                () => {},
              )
          : undefined
      }
    />
  ) : null

  return { controls, countsByUnit, dialog }
}
