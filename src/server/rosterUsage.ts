import type { Roster } from '../core/battle'
import { migratedEditionId, migratedEditionPick } from '../core/editionMigrations'
import { frozenReminders, rosterSnapshot } from '../core/rosterSnapshot'
import type { AbilityReminder } from '../core/reminders'
import { fieldingReminders } from '../shared/reminderAbilities'
import { ROSTER_NOT_USABLE } from '../core/rosterUse'
import { app } from './app'
import { requireCatalogue } from './requireCatalogue'
import { unitBattleDetailsIn } from '../shared/catalogue'
import { calculateRosterPrice, savedRosterPriceInput } from '../shared/pricing'

import { rosterProblems } from '../core/rosterLegality'

/**
 * A battle may field a roster a friend lent; a sealed event entry is sealed from the entrant's own rosters, without alerts,
 * which its battles field as they stand.
 */
export async function rosterForUse(userId: string, rosterId: string, options: { lent?: boolean; sealing?: boolean } = {}) {
  const usable = await app().service.rosterService.usableRoster(userId, rosterId)
  if (!usable || (usable.lentBy && !options.lent)) {
    throw new Response(options.lent ? 'this roster is not yours or lent to you' : 'you do not own this roster', { status: 403 })
  }
  const { roster: saved, lentBy } = usable
  // The player fielding a list brings their own alerts, a borrowed list included.
  const settings = options.sealing ? [] : await app().repository.abilityRemindersByUser(userId)
  return { saved, snapshot: { ...(await frozenRoster(saved, settings, options)), ...(lentBy ? { lentBy } : {}) } }
}

type UsableRoster = Parameters<typeof rosterSnapshot>[0] &
  Parameters<typeof savedRosterPriceInput>[0] &
  Parameters<typeof rosterProblems>[1]

/**
 * A list priced, checked, and frozen the way a battle fields it, whoever holds it, with its player's alerts. A sealed
 * list's points answer to its event instead, where allies who share points may spend past their own saved total.
 */
async function frozenRoster(saved: UsableRoster, settings: readonly AbilityReminder[], options: { sealing?: boolean } = {}) {
  const catalogue = await requireCatalogue(saved.catalogueId)
  const rules = await app().rulesFor(saved.catalogueId)
  if (!rules) throw new Response('army rules data is not available', { status: 409 })
  const priced = calculateRosterPrice(savedRosterPriceInput(saved), catalogue, rules)
  if (!priced) throw new Response('army data is not available', { status: 409 })
  const problem = rosterProblems(priced, saved).find(({ kind }) => !options.sealing || kind !== 'over-limit')
  if (problem) throw new Response(`${ROSTER_NOT_USABLE}: ${problem.message}`, { status: 409 })
  const details = unitBattleDetailsIn(
    catalogue,
    saved.catalogueId,
    saved.picks.map((pick) => pick.entryId),
  )
  return rosterSnapshot({ ...saved, reminders: fieldingReminders(catalogue, rules, saved, priced.units, settings) }, priced, details)
}

/**
 * A sealed list as a battle fields it: with its player's alerts, and with the model lines a list sealed before
 * units were split into them lacks. A list the catalogue no longer prices into its sealed units gains neither.
 */
export async function fieldedSealedList(roster: Roster, userId: string): Promise<Roster> {
  // An older sealed list carries the alerts it was sealed with, which never field.
  const { reminders: _sealed, ...list } = roster
  const built = roster.built
  if (!built?.picks) return list
  const catalogueId = migratedEditionId(built.catalogueId)
  const [catalogue, rules, settings] = await Promise.all([
    app().catalogueFor(catalogueId),
    app().rulesFor(catalogueId),
    app().repository.abilityRemindersByUser(userId),
  ])
  if (!catalogue || !rules) return list
  const saved = {
    catalogueId,
    detachmentIds: built.detachmentIds ?? [],
    disposition: built.disposition,
    limit: built.limit,
    picks: built.picks.map((pick) => migratedEditionPick(pick, built.catalogueId)),
    waivedRules: built.waivedRules ?? [],
  }
  const priced = calculateRosterPrice(savedRosterPriceInput(saved), catalogue, rules)
  if (!priced || priced.units.map((unit) => unit.entryId).join() !== built.units.map((unit) => unit.entryId).join()) return list
  const units = built.units.map((unit, index) => {
    const lines = priced.units[index]?.modelLines
    return unit.modelLines || !lines || lines.reduce((total, line) => total + line.models, 0) !== unit.models
      ? unit
      : { ...unit, modelLines: lines.map((line) => ({ ...line, wargear: line.wargear.map((piece) => ({ ...piece })) })) }
  })
  return {
    ...list,
    built: { ...built, units },
    ...(settings.length
      ? { reminders: frozenReminders(fieldingReminders(catalogue, rules, saved, priced.units, settings), priced.units) }
      : {}),
  }
}
