import fs from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { battleChoices } from '../src/core/battleChoices'
import { combatRuleAppliesTo, type CombatRule } from '../src/core/combatRules'
import { buildUnit, type RosterPick } from '../src/core/roster'
import { recordCardReadings } from '../src/server/datacards'
import { snapshotWords } from '../src/server/sourceTexts'
import { readableCombatant } from '../src/client/features/simulator/readableRules'
import { combatUnitsFor } from '../src/shared/combatUnits'
import { withReadRules } from '../src/shared/rosterGradeMeasures'
import { datasheetCombatant, rosterCombatant, withRecordedRules } from '../src/shared/rosterCombatRules'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

/**
 * A device never holds a rule's words, so it plays each rule from the facts recorded beside its token. Read from the
 * snapshot's words instead, as the server reads them, a unit must play the same.
 */
describe.skipIf(!fs.existsSync(directory))('rules a device plays from recorded facts', () => {
  let served: ReturnType<typeof loadSnapshotWithRules>
  let device: ReturnType<typeof loadSnapshotWithRules>
  let words: ReturnType<typeof snapshotWords>

  beforeAll(() => {
    served = loadSnapshotWithRules(directory)
    // A server's cards record no readings; the device download's do.
    recordCardReadings()
    device = loadSnapshotWithRules(directory)
    words = snapshotWords(directory)
  }, 180_000)

  describe('buffs a device plays from recorded facts', () => {
    let index: ReturnType<typeof combatUnitsFor>

    beforeAll(() => {
      index = combatUnitsFor(device.catalogue, device.rules)
    })

    /** The buffs a unit's panel offers in each role, by name, with its rules read one way or the other. */
    const offered = (faction: string, unit: string, detachment: string, read: 'words' | 'facts' | 'server') => {
      const book = index.find((candidate) => candidate.name === faction)!
      const entryId = book.units.find((candidate) => candidate.name === unit)!.id
      const detachmentId = device.catalogue.detachments.get(book.catalogueId)!.options.find((option) => option.name === detachment)!.id
      const loaded = read === 'server' ? served : device
      const projected = rosterCombatant(loaded.catalogue, loaded.rules, {
        catalogueId: book.catalogueId,
        detachmentIds: [detachmentId],
        picks: [{ entryId }],
        pickIndex: 0,
      })!
      const projection =
        read === 'words'
          ? withReadRules(projected, words)
          : readableCombatant(read === 'server' ? withRecordedRules(projected, words) : projected)
      const rules: CombatRule[] = [...projection.rules, ...projection.companions.flatMap((member) => member.rules)]
      const role = (as: 'attacker' | 'defender') =>
        rules
          .filter((rule) => !rule.included && combatRuleAppliesTo(rule, as))
          .map((rule) => rule.name)
          .toSorted()
      return { attacker: role('attacker'), defender: role('defender') }
    }

    it('offers a Gladius Task Force unit every buff its rules’ words give from the server, as a battle asks for it', () => {
      expect(offered('Space Marines', 'Intercessor Squad', 'Gladius Task Force', 'server')).toEqual(
        offered('Space Marines', 'Intercessor Squad', 'Gladius Task Force', 'words'),
      )
    })

    it('offers a Gladius Task Force unit every buff its rules’ words give', () => {
      expect(offered('Space Marines', 'Intercessor Squad', 'Gladius Task Force', 'facts')).toEqual(
        offered('Space Marines', 'Intercessor Squad', 'Gladius Task Force', 'words'),
      )
    })
  })

  /** What abilities allow a unit's Orders is recorded from their words beside their tokens, so both give a unit as many. */
  describe('how many Orders a unit can take', () => {
    let book: ReturnType<typeof combatUnitsFor>[number]

    beforeAll(() => {
      book = combatUnitsFor(served.catalogue, served.rules).find((candidate) => candidate.name === 'Astra Militarum')!
    })

    const unit = (name: string) => book.units.find((candidate) => candidate.name === name)!.id
    /** The Orders limit of the first pick, led by the rest, as the builder shows it from the server's answer or a device's own. */
    const orders = (answered: 'server' | 'device', ...picks: RosterPick[]) => {
      const loaded = answered === 'server' ? served : device
      const combatant = datasheetCombatant(loaded.catalogue, loaded.rules, {
        catalogueId: book.catalogueId,
        detachmentIds: [],
        picks,
        pickIndex: 0,
      })!
      const shown = readableCombatant(answered === 'server' ? withRecordedRules(combatant, words) : combatant)
      return battleChoices(shown.rules, shown.battleChoiceAllowances).find((choice) => choice.rule.name === 'Voice of Command')?.limit
    }
    const withCommandRod = (): RosterPick => {
      const entryId = unit('Militarum Tempestus Command Squad')
      const built = buildUnit(entryId, served.catalogue.index, undefined, {}, { primaryCatalogueId: book.catalogueId })!
      const choice = built.choices.find((candidate) => candidate.options.some((option) => option.name === 'Command rod'))!
      return { entryId, choices: { [choice.key]: choice.options.find((option) => option.name === 'Command rod')!.id }, attachedTo: 0 }
    }

    describe.each(['server', 'device'] as const)('as the %s answers', (answered) => {
      it('gives Kasrkin the extra Order Warrior Elite selects', () => expect(orders(answered, { entryId: unit('Kasrkin') })).toBe(2))

      it('gives Kasrkin led by Ursula Creed three Orders', () =>
        expect(orders(answered, { entryId: unit('Kasrkin') }, { entryId: unit('Ursula Creed'), attachedTo: 0 })).toBe(3))

      it('gives Tempestus Scions led by a Tempestor Prime with a Command Rod two Orders', () =>
        expect(orders(answered, { entryId: unit('Tempestus Scions') }, withCommandRod())).toBe(2))
    })
  })
})
