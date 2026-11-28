import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { LoadedCatalogue } from '../src/shared/catalogueIndex'
import { calculateRosterPrice } from '../src/shared/pricing'
import type { LoadedRules } from '../src/shared/rules'
import { vsFirstPickOf } from '../src/shared/vsDataPicks'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'
const spaceMarines = 'e0af-67df-9d63-8fb7'
const gladiusTaskForce = 'd2dc-693e-b491-b16d'
const chaplain = 'dfb5-f763-308d-e0d9'
const librarian = 'b62e-cd23-d338-8142'
const ancient = 'cd69-af58-774-d387'

describe.skipIf(!fs.existsSync(path.join(directory, 'definitions')))('a list of VS picks alone', () => {
  let loaded: LoadedCatalogue
  let rules: LoadedRules | null

  beforeAll(() => {
    ;({ catalogue: loaded, rules } = loadSnapshot(directory))
  })

  it('counts the Enhancements of picks the catalogue no longer evaluates', () => {
    const list = { catalogueId: spaceMarines, detachmentIds: [gladiusTaskForce] }
    const pick = (entryId: string, enhancement: string) => ({ entryId, vs: { ...vsFirstPickOf(loaded, list, entryId)!, enhancement } })
    const units = [
      pick(chaplain, 'space-marines.gladius-task-force.artificer-armour'),
      pick(librarian, 'space-marines.gladius-task-force.laurels-of-triumph'),
      pick(ancient, 'space-marines.gladius-task-force.standard-of-the-emperor-ascendant'),
    ]
    const { errors } = calculateRosterPrice({ ...list, disposition: null, limit: 600, units }, loaded, rules)!
    expect(errors.map((error) => error.message)).toContain('allows at most 2 Enhancements, has 3')
  })
})
