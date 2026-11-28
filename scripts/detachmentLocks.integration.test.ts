import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { LoadedCatalogue } from '../src/shared/catalogueIndex'
import { calculateRosterPrice } from '../src/shared/pricing'
import type { LoadedRules } from '../src/shared/rules'
import { catalogueEditionLoaders } from '../src/server/catalogueEditions'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'
const daemons = 'd265-877b-e03d-30ca'
const bloodLegion = '21b4-7a36-fec6-b7ea'
const chaosLord = 'ff82-62db-35d1-414a'
const locked = { entryId: chaosLord, entryName: 'Chaos Lord', message: 'needs the Shadow Legion detachment' }

describe.skipIf(!fs.existsSync(path.join(directory, 'definitions')))('a Chaos Lord in a Chaos Daemons army outside Shadow Legion', () => {
  let loaded: LoadedCatalogue
  let rules: LoadedRules | null
  let earlier: LoadedCatalogue | null
  const earlierId = `custodes-11e~${daemons}`
  const errors = (catalogueId: string, source: LoadedCatalogue | null) =>
    calculateRosterPrice(
      { catalogueId, detachmentIds: [bloodLegion], disposition: null, limit: 2000, units: [{ entryId: chaosLord }] },
      source,
      rules,
    )!.errors

  beforeAll(() => {
    ;({ catalogue: loaded, rules } = loadSnapshot(directory))
    // Loading a rules version is slow, so it happens here rather than inside a test's own time limit.
    earlier = catalogueEditionLoaders(
      directory,
      () => loaded,
      () => rules,
    ).catalogueFor(earlierId)
  })

  it('is told the Detachment it needs in the catalogue’s words where VS Data places the list', () => {
    expect(errors(daemons, loaded)).toContainEqual(locked)
  })

  it('is told the Detachment it needs by the catalogue in a rules version VS Data does not cover', () => {
    expect(errors(earlierId, earlier)).toContainEqual(locked)
  })
})
