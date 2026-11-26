import fs from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { battleChoices } from '../src/core/battleChoices'
import { buildUnit, type RosterPick } from '../src/core/roster'
import { readableCombatant } from '../src/client/features/simulator/readableRules'
import { combatUnitsFor } from '../src/shared/combatUnits'
import { datasheetCombatant } from '../src/shared/rosterCombatRules'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

/** What abilities allow a unit's Orders, from their VS Data facts, which the server and a device read alike. */
describe.skipIf(!fs.existsSync(directory))('how many Orders a unit can take', () => {
  let served: ReturnType<typeof loadSnapshotWithRules>
  let book: ReturnType<typeof combatUnitsFor>[number]

  beforeAll(() => {
    served = loadSnapshotWithRules(directory)
    book = combatUnitsFor(served.catalogue, served.rules).find((candidate) => candidate.name === 'Astra Militarum')!
  }, 180_000)

  const unit = (name: string) => book.units.find((candidate) => candidate.name === name)!.id
  /** The Orders limit of the first pick, led by the rest, as the builder shows it. */
  const orders = (...picks: RosterPick[]) => {
    const combatant = datasheetCombatant(served.catalogue, served.rules, {
      catalogueId: book.catalogueId,
      detachmentIds: [],
      picks,
      pickIndex: 0,
    })!
    const shown = readableCombatant(combatant)
    return battleChoices(shown.rules, shown.battleChoiceAllowances).find((choice) => choice.rule.name === 'Voice of Command')?.limit
  }
  const withCommandRod = (): RosterPick => {
    const entryId = unit('Militarum Tempestus Command Squad')
    const built = buildUnit(entryId, served.catalogue.index, undefined, {}, { primaryCatalogueId: book.catalogueId })!
    const choice = built.choices.find((candidate) => candidate.options.some((option) => option.name === 'Command rod'))!
    return { entryId, choices: { [choice.key]: choice.options.find((option) => option.name === 'Command rod')!.id }, attachedTo: 0 }
  }

  it('gives Kasrkin the extra Order Warrior Elite selects', () => expect(orders({ entryId: unit('Kasrkin') })).toBe(2))

  it('gives Kasrkin led by Ursula Creed three Orders', () =>
    expect(orders({ entryId: unit('Kasrkin') }, { entryId: unit('Ursula Creed'), attachedTo: 0 })).toBe(3))

  it('gives Tempestus Scions led by a Tempestor Prime with a Command Rod two Orders', () =>
    expect(orders({ entryId: unit('Tempestus Scions') }, withCommandRod())).toBe(2))
})
