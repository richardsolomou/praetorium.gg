import fs from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { datasheetProfilesByKind } from '../src/core/datasheetStructure'
import { datasheetIn } from '../src/shared/catalogue'
import { combatUnitsFor } from '../src/shared/combatUnits'
import { describeDatasheetAbilities } from '../src/shared/datasheetDescriptions'
import { datasheetCombatant } from '../src/shared/rosterCombatRules'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

describe.skipIf(!fs.existsSync(directory))('ability reminders', () => {
  let snapshot: ReturnType<typeof loadSnapshotWithRules>
  let index: ReturnType<typeof combatUnitsFor>

  beforeAll(() => {
    snapshot = loadSnapshotWithRules(directory)
    index = combatUnitsFor(snapshot.catalogue, snapshot.rules)
  }, 180_000)

  /** The phases a unit's ability reminds its player in. */
  const phases = (faction: string, unit: string, ability: string) => {
    const book = index.find((candidate) => candidate.name === faction)!
    const sheet = datasheetIn(snapshot.catalogue, book.catalogueId, book.units.find((candidate) => candidate.name === unit)!.id)
    const described = describeDatasheetAbilities(snapshot.catalogue, book.catalogueId, sheet, snapshot.rules)
    return described?.abilities.find((candidate) => candidate.name === ability)?.reminder?.timings.map((timing) => timing.phase)
  }

  // A core ability is named with its value, as "Firing Deck 7", and its own record, not an unread same-named one, says when.
  it.each([
    ['Space Marines', 'Impulsor', 'Firing Deck 7', 'shooting'],
    ['Chaos Daemons', 'Contorted Epitome', 'Fights First', 'fight'],
  ] as const)('%s %s reminds of %s in the %s phase', (faction, unit, ability, phase) => {
    expect(phases(faction, unit, ability)).toContain(phase)
  })

  it('shows a Detachment rule a datasheet prints, which grants itself to its units, once', () => {
    const book = index.find((candidate) => candidate.name === 'Tyranids')!
    const entryId = book.units.find((candidate) => candidate.name === 'Norn Emissary')!.id
    const detachmentIds = [
      snapshot.catalogue.detachments.get(book.catalogueId)!.options.find((option) => option.name === 'Talons of the Norn Queen')!.id,
    ]
    const taken = datasheetCombatant(snapshot.catalogue, snapshot.rules, {
      catalogueId: book.catalogueId,
      detachmentIds,
      picks: [{ entryId }],
      pickIndex: 0,
    })!.selected
    expect(taken.abilities.filter((ability) => ability.name === 'Protean Purpose')).toHaveLength(1)
  })

  /** The invulnerable save a datasheet's model profile shows. */
  const invulnerable = (faction: string, unit: string, model: string) => {
    const book = index.find((candidate) => candidate.name === faction)!
    const sheet = datasheetIn(snapshot.catalogue, book.catalogueId, book.units.find((candidate) => candidate.name === unit)!.id)!
    const profile = datasheetProfilesByKind(sheet).unit.find((candidate) => candidate.name === model)
    return profile?.values.find((value) => value.kind === 'invulnerable-save')?.value ?? '-'
  }

  // A save printed as an ability's bare value is the model's own; a save the rule makes conditional is the simulator's to apply.
  it.each([
    ['Agents of the Imperium', 'Proteus Kill Team [Legends]', 'Kill Team Terminator', '4+'],
    ['Astra Militarum', 'Primaris Psyker', 'Primaris Psyker', '-'],
  ] as const)('%s %s shows %s an invulnerable save of %s', (faction, unit, model, save) => {
    expect(invulnerable(faction, unit, model)).toBe(save)
  })
})
