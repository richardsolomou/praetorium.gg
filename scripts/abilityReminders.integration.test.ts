import fs from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { datasheetIn } from '../src/shared/catalogue'
import { combatUnitsFor } from '../src/shared/combatUnits'
import { describeDatasheetAbilities } from '../src/shared/datasheetDescriptions'
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
})
