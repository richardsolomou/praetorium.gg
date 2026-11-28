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
const ultramarines = '4029-9237-e8db-af55'
const assaultBrethren = '549e-86b2-b786-c802'
// Ambull, Bastion, Firestorm Redoubt, Fortress of Redemption, Guardian Drone and Imperial Fortress Walls, over 500 points.
const fortifications = [
  '60d8-7d2-71d-6e4a',
  '89f2-5111-a9c4-6016',
  '578b-5072-a0d5-ba2',
  'ecf6-b23e-96d9-2d16',
  'da3c-7385-5909-abd5',
  '52a0-2f07-647b-30d0',
]

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

describe.skipIf(!fs.existsSync(path.join(directory, 'definitions')))('Unaligned Forces in a list VS Data places', () => {
  let loaded: LoadedCatalogue
  let rules: LoadedRules | null

  beforeAll(() => {
    ;({ catalogue: loaded, rules } = loadSnapshot(directory))
  })

  it('reports VS Data’s points limit in place of the catalogue’s cap', () => {
    const { errors } = calculateRosterPrice(
      {
        catalogueId: ultramarines,
        detachmentIds: [assaultBrethren],
        disposition: null,
        limit: 2000,
        units: fortifications.map((entryId) => ({ entryId })),
      },
      loaded,
      rules,
    )!
    expect(errors.flatMap((error) => (/points/.test(error.message) ? [`${error.entryName}: ${error.message}`] : []))).toEqual([
      expect.stringMatching(/^Army: allied Unaligned Forces units cost at most 500 points, cost \d+$/),
    ])
  })
})
