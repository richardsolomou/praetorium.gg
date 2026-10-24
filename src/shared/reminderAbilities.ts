import { fieldedReminders, reminderKey, type AbilityReminder } from '../core/reminders'
import type { RosterPick } from '../core/roster'
import type { LoadedCatalogue } from './catalogueIndex'
import { datasheetAbilitiesIn } from './catalogue'
import { describedAbilityKind, detachmentUpgradeNames } from './datasheetDescriptions'
import type { LoadedRules } from './rules'
import { rosterDatasheetContext, rosterDatasheetSelections } from './rosterDatasheetContext'

type ReminderRoster = { catalogueId: string; detachmentIds: readonly string[]; picks: readonly RosterPick[] }

/** The alert keys of the abilities each pick's datasheet shows in this roster, by pick position, kinded as the builder shows them. */
export function datasheetReminderAbilities(
  loaded: LoadedCatalogue,
  rules: LoadedRules | null,
  roster: ReminderRoster,
): [number, string[]][] {
  const data = { catalogueId: roster.catalogueId, detachmentIds: [...roster.detachmentIds], picks: [...roster.picks] }
  const prepared = rosterDatasheetSelections(loaded, data)
  const upgradeNames = detachmentUpgradeNames(loaded, data.catalogueId, rules)
  return prepared.unitSelections.flatMap(({ pickIndex }) => {
    const context = rosterDatasheetContext(loaded, { ...data, pickIndex }, prepared)
    const pick = data.picks[pickIndex]
    const sheet = context && pick && datasheetAbilitiesIn(loaded, pick.catalogueId ?? data.catalogueId, pick.entryId, context)
    if (!sheet) return []
    const keys = sheet.abilities.map((ability) => reminderKey({ ...ability, kind: describedAbilityKind(ability, upgradeNames) }))
    return [[pickIndex, [...new Set(keys)]]]
  })
}

/** A player's alerts frozen for one roster's units, in the pick positions `rosterSnapshot` reads. */
export function fieldingReminders(
  loaded: LoadedCatalogue,
  rules: LoadedRules | null,
  roster: ReminderRoster,
  units: Parameters<typeof fieldedReminders>[1]['units'],
  settings: readonly AbilityReminder[],
) {
  if (!settings.length) return []
  return fieldedReminders(settings, { detachmentIds: roster.detachmentIds, units }, datasheetReminderAbilities(loaded, rules, roster))
}
