import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { LoadedCatalogue } from '../src/shared/catalogueIndex'
import { calculateRosterPrice } from '../src/shared/pricing'
import type { LoadedRules } from '../src/shared/rules'
import { vsFirstPickOf } from '../src/shared/vsDataPicks'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'
const blackTemplars = '36d3-36bc-68dd-40ac'
const assaultBrethren = '549e-86b2-b786-c802'
const emperorsChampion = 'ce18-4cb9-c844-c869'

describe.skipIf(!fs.existsSync(path.join(directory, 'definitions')))('the Emperor’s Champion fielded by VS Data', () => {
  let loaded: LoadedCatalogue
  let rules: LoadedRules | null

  beforeAll(() => {
    ;({ catalogue: loaded, rules } = loadSnapshot(directory))
  })

  it('is taken once, as the catalogue says, where VS Data’s unit lacks the keyword its faction limits', () => {
    const list = { catalogueId: blackTemplars, detachmentIds: [assaultBrethren] }
    const pick = { entryId: emperorsChampion, vs: vsFirstPickOf(loaded, list, emperorsChampion) }
    const { errors } = calculateRosterPrice({ ...list, disposition: null, limit: 2000, units: [pick, pick] }, loaded, rules)!
    expect(errors.map((error) => `${error.entryName}: ${error.message}`)).toContain("Emperor's Champion: allows at most 1, has 2")
  })
})
