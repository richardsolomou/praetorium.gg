import { detachmentRuleSubject, fieldedReminders, reminderKey, type AbilityReminder, type ReminderSubject } from '../core/reminders'
import type { RosterPick } from '../core/roster'
import { routeSlug } from '../core/slug'
import type { LoadedCatalogue } from './catalogueIndex'
import { datasheetAbilitiesIn, datasheetIn } from './catalogue'
import { describeDatasheetAbilities, describedAbilityKind, detachmentUpgradeNames } from './datasheetDescriptions'
import { detachmentReference } from './detachmentReference'
import type { LoadedRules } from './rules'
import { rosterDatasheetContext, rosterDatasheetSelections } from './rosterDatasheetContext'

type ReminderRoster = { catalogueId: string; detachmentIds: readonly string[]; picks: readonly RosterPick[] }
type FieldedUnit = {
  key: number
  name: string
  choices: readonly { kind?: 'enhancement' | 'upgrade'; chosen: string; options?: readonly { id: string; description?: string | null }[] }[]
}

/** Each unit pick of a roster, with the datasheet it fields as: its position, catalogue, entry and context. */
function pickSheets(loaded: LoadedCatalogue, roster: ReminderRoster) {
  const data = { catalogueId: roster.catalogueId, detachmentIds: [...roster.detachmentIds], picks: [...roster.picks] }
  const prepared = rosterDatasheetSelections(loaded, data)
  return prepared.unitSelections.flatMap(({ pickIndex }) => {
    const context = rosterDatasheetContext(loaded, { ...data, pickIndex }, prepared)
    const pick = data.picks[pickIndex]
    return context && pick ? [{ pickIndex, catalogueId: pick.catalogueId ?? data.catalogueId, entryId: pick.entryId, context }] : []
  })
}

/** The alert keys of the abilities each pick's datasheet shows in this roster, by pick position, kinded as the builder shows them. */
export function datasheetReminderAbilities(
  loaded: LoadedCatalogue,
  rules: LoadedRules | null,
  roster: ReminderRoster,
): [number, string[]][] {
  const upgradeNames = detachmentUpgradeNames(loaded, roster.catalogueId, rules)
  return pickSheets(loaded, roster).flatMap(({ pickIndex, catalogueId, entryId, context }) => {
    const sheet = datasheetAbilitiesIn(loaded, catalogueId, entryId, context)
    if (!sheet) return []
    const keys = sheet.abilities.map((ability) => reminderKey({ ...ability, kind: describedAbilityKind(ability, upgradeNames) }))
    return [[pickIndex, [...new Set(keys)]]]
  })
}

/**
 * What each ability a roster fields prints now, by alert key. An alert keeps the text its ability printed when it was
 * set, as tokens naming that snapshot's files, which stop resolving once the catalogue moves on.
 */
function currentDescriptions(loaded: LoadedCatalogue, rules: LoadedRules | null, roster: ReminderRoster, units: readonly FieldedUnit[]) {
  const descriptions = new Map<string, string>()
  const add = (subject: ReminderSubject) => {
    if (subject.description) descriptions.set(reminderKey(subject), subject.description)
  }
  for (const { catalogueId, entryId, context } of pickSheets(loaded, roster))
    describeDatasheetAbilities(loaded, catalogueId, datasheetIn(loaded, catalogueId, entryId, context), rules)?.abilities.forEach(add)
  const options = loaded.detachments.get(roster.catalogueId)?.options ?? []
  for (const id of roster.detachmentIds) {
    const option = options.find((candidate) => candidate.id === id)
    const reference = option && rules && detachmentReference(loaded, rules, roster.catalogueId, routeSlug(option.name))
    reference?.rules.forEach((rule) => add(detachmentRuleSubject(id, rule)))
  }
  for (const { choices } of units)
    for (const { kind, chosen, options: chosenFrom } of choices) {
      const option = kind && chosenFrom?.find((candidate) => candidate.id === chosen)
      if (option) add({ id: option.id, kind, name: '', description: option.description })
    }
  return descriptions
}

/** A player's alerts frozen for one roster's units, in the pick positions `rosterSnapshot` reads, with their abilities' current text. */
export function fieldingReminders(
  loaded: LoadedCatalogue,
  rules: LoadedRules | null,
  roster: ReminderRoster,
  units: readonly FieldedUnit[],
  settings: readonly AbilityReminder[],
) {
  if (!settings.length) return []
  const descriptions = currentDescriptions(loaded, rules, roster, units)
  const current = settings.map((setting) => ({ ...setting, description: descriptions.get(setting.key) ?? setting.description }))
  return fieldedReminders(current, { detachmentIds: roster.detachmentIds, units }, datasheetReminderAbilities(loaded, rules, roster))
}
