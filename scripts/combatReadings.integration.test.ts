import fs from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { combatRuleAppliesTo, type CombatRule } from '../src/core/combatRules'
import { recordCardReadings } from '../src/server/datacards'
import { snapshotWords } from '../src/server/sourceTexts'
import { readableCombatant } from '../src/client/features/simulator/readableRules'
import { combatUnitsFor } from '../src/shared/combatUnits'
import { withReadRules } from '../src/shared/rosterGradeMeasures'
import { rosterCombatant, withRecordedRules } from '../src/shared/rosterCombatRules'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

/**
 * A device never holds a rule's words, so it plays each rule from the facts recorded beside its token. Read from the
 * snapshot's words instead, as the server reads them, the same unit must be offered the same buffs.
 */
describe.skipIf(!fs.existsSync(directory))('buffs a device plays from recorded facts', () => {
  let snapshot: ReturnType<typeof loadSnapshotWithRules>
  let served: ReturnType<typeof loadSnapshotWithRules>
  let index: ReturnType<typeof combatUnitsFor>
  let words: ReturnType<typeof snapshotWords>

  beforeAll(() => {
    // A server's cards record no readings; the device download's do.
    served = loadSnapshotWithRules(directory)
    recordCardReadings()
    snapshot = loadSnapshotWithRules(directory)
    index = combatUnitsFor(snapshot.catalogue, snapshot.rules)
    words = snapshotWords(directory)
  }, 180_000)

  /** The buffs a unit's panel offers in each role, by name, with its rules read one way or the other. */
  const offered = (faction: string, unit: string, detachment: string, read: 'words' | 'facts' | 'server') => {
    const book = index.find((candidate) => candidate.name === faction)!
    const entryId = book.units.find((candidate) => candidate.name === unit)!.id
    const detachmentId = snapshot.catalogue.detachments.get(book.catalogueId)!.options.find((option) => option.name === detachment)!.id
    const loaded = read === 'server' ? served : snapshot
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
