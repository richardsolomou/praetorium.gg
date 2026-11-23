import fs from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { battleChoices } from '../src/core/battleChoices'
import { buildUnit, type RosterPick } from '../src/core/roster'
import { snapshotWords } from '../src/server/sourceTexts'
import { readableCombatant } from '../src/client/features/simulator/readableRules'
import { combatUnitsFor } from '../src/shared/combatUnits'
import { datasheetCombatant, withBattleChoiceAllowances, withRecordedRules } from '../src/shared/rosterCombatRules'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

/** A device never holds an ability's words, so the server reads what they allow a unit's Orders before it answers. */
describe.skipIf(!fs.existsSync(directory))('how many Orders a unit the server answers can take', () => {
  let snapshot: ReturnType<typeof loadSnapshotWithRules>
  let words: ReturnType<typeof snapshotWords>
  let book: ReturnType<typeof combatUnitsFor>[number]

  beforeAll(() => {
    snapshot = loadSnapshotWithRules(directory)
    words = snapshotWords(directory)
    book = combatUnitsFor(snapshot.catalogue, snapshot.rules).find((candidate) => candidate.name === 'Astra Militarum')!
  }, 180_000)

  const unit = (name: string) => book.units.find((candidate) => candidate.name === name)!.id
  /** The Orders limit of the first pick, led by the rest, as the builder shows it from the server's answer. */
  const orders = (...picks: RosterPick[]) => {
    const combatant = datasheetCombatant(snapshot.catalogue, snapshot.rules, {
      catalogueId: book.catalogueId,
      detachmentIds: [],
      picks,
      pickIndex: 0,
    })!
    const served = readableCombatant(withBattleChoiceAllowances(withRecordedRules(combatant, words), words))
    return battleChoices(served.rules, served.battleChoiceAllowances).find((choice) => choice.rule.name === 'Voice of Command')?.limit
  }
  const withCommandRod = (): RosterPick => {
    const entryId = unit('Militarum Tempestus Command Squad')
    const built = buildUnit(entryId, snapshot.catalogue.index, undefined, {}, { primaryCatalogueId: book.catalogueId })!
    const choice = built.choices.find((candidate) => candidate.options.some((option) => option.name === 'Command rod'))!
    return { entryId, choices: { [choice.key]: choice.options.find((option) => option.name === 'Command rod')!.id }, attachedTo: 0 }
  }

  it('gives Kasrkin the extra Order Warrior Elite selects', () => expect(orders({ entryId: unit('Kasrkin') })).toBe(2))

  it('gives Kasrkin led by Ursula Creed three Orders', () =>
    expect(orders({ entryId: unit('Kasrkin') }, { entryId: unit('Ursula Creed'), attachedTo: 0 })).toBe(3))

  it('gives Tempestus Scions led by a Tempestor Prime with a Command Rod two Orders', () =>
    expect(orders({ entryId: unit('Tempestus Scions') }, withCommandRod())).toBe(2))
})
