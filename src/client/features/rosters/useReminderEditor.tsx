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
import { ownWords } from '../../../core/sourceText'
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
  const [editing, setEditing] = useState<{ draft: ReminderDraft; ruleId: string | undefined; owner: string | null } | null>(null)
  const resetAbilityAlert = abilityAlerts.reset
  const controls = {
    active: (subject: ReminderSubject) => abilityAlerts.settings.some((reminder) => reminder.key === reminderKey(subject)),
    onSelect: (subject: ReminderSubject, owner: string | null) => {
      const key = reminderKey(subject)
      const description = ownWords(subject.description ?? '') ?? ''
      const suggested = subject.reminder ?? {
        timings: suggestReminderTimings(description),
        ...(suggestReminderWhileDestroyed(description) ? { whileDestroyed: true as const } : {}),
      }
      resetAbilityAlert()
      const saved = abilityAlerts.settings.find((reminder) => reminder.key === key)
      const draft: ReminderDraft = saved
        ? { ...saved, description: subject.description ?? saved.description }
        : {
            key,
            ability: subject.name,
            description: subject.description ?? '',
            timings: suggested.timings,
            ...(!armyReminder(subject) && suggested.whileDestroyed ? { whileDestroyed: true } : {}),
          }
      setEditing({ draft, ruleId: subject.id, owner })
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
  const dialog = editing ? (
    <ReminderEditorDialog
      key={editing.draft.key}
      draft={editing.draft}
      ruleId={editing.ruleId}
      owner={editing.owner}
      full={!abilityAlerts.fits(editing.draft.key)}
      error={abilityAlerts.error}
      onClose={() => setEditing(null)}
      onSave={(reminder) =>
        void abilityAlerts.save(reminder).then(
          () => setEditing(null),
          () => {},
        )
      }
      onRemove={
        abilityAlerts.settings.some((reminder) => reminder.key === editing.draft.key)
          ? () =>
              void abilityAlerts.remove(editing.draft.key).then(
                () => setEditing(null),
                () => {},
              )
          : undefined
      }
    />
  ) : null

  return { controls, countsByUnit, dialog }
}
