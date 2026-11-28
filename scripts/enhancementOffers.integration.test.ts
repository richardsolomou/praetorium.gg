import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { LoadedCatalogue } from '../src/shared/catalogueIndex'
import { calculateRosterPrice } from '../src/shared/pricing'
import type { LoadedRules } from '../src/shared/rules'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'
const spaceMarines = 'e0af-67df-9d63-8fb7'
const gladiusTaskForce = 'd2dc-693e-b491-b16d'
const librarian = 'b62e-cd23-d338-8142'

describe.skipIf(!fs.existsSync(path.join(directory, 'definitions')))('the Enhancements a catalogue unit is offered', () => {
  let loaded: LoadedCatalogue
  let rules: LoadedRules | null

  beforeAll(() => {
    ;({ catalogue: loaded, rules } = loadSnapshot(directory))
  })

  it('leaves out one VS Data’s eligibility refuses the unit, as the list check does', () => {
    const list = { catalogueId: spaceMarines, detachmentIds: [gladiusTaskForce], disposition: null, limit: 600 }
    const [unit] = calculateRosterPrice({ ...list, units: [{ entryId: librarian }] }, loaded, rules)!.units
    const offered = unit!.choices.flatMap((choice) => (choice.kind ? choice.options.map((option) => option.name) : []))
    expect(offered).not.toContain('Standard of the Emperor Ascendant')
  })
})
