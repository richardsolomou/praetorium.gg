import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { LoadedCatalogue } from '../src/shared/catalogueIndex'
import { calculateRosterPrice } from '../src/shared/pricing'
import type { LoadedRules } from '../src/shared/rules'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'
const chaosSpaceMarines = 'c8da-e875-58f7-f6d6'
const renegadeWarband = '2cf4-ac9c-5417-10ac'
const chaosLord = 'abb7-f523-2b5a-b634'
const bloodletters = '208b-348-8114-b506'
const daemonicCharioteer = '736e-8d31-9f86-88b3'

describe.skipIf(!fs.existsSync(path.join(directory, 'definitions')))('daemons in a Chaos Space Marines army', () => {
  let loaded: LoadedCatalogue
  let rules: LoadedRules | null

  beforeAll(() => {
    ;({ catalogue: loaded, rules } = loadSnapshot(directory))
  })

  it('keeps the catalogue’s cap where it also counts a daemon VS Data leaves out', () => {
    const units = [chaosLord, bloodletters, bloodletters, bloodletters, bloodletters, daemonicCharioteer].map((entryId) => ({ entryId }))
    const { errors } = calculateRosterPrice(
      { catalogueId: chaosSpaceMarines, detachmentIds: [renegadeWarband], disposition: null, limit: 2000, units },
      loaded,
      rules,
    )!
    expect(errors.map((error) => `${error.entryName}: ${error.message}`)).toContain(
      'Faction: Legiones Daemonica: allows at most 500 points, has 560',
    )
  })
})
