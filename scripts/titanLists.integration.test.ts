import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { nameOf } from '../src/core/catalogue'
import type { LoadedCatalogue } from '../src/shared/catalogueIndex'
import { calculateRosterPrice } from '../src/shared/pricing'
import type { LoadedRules } from '../src/shared/rules'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

describe.skipIf(!fs.existsSync(path.join(directory, 'definitions')))('a Titan army, which takes no Detachment', () => {
  let loaded: LoadedCatalogue
  let rules: LoadedRules | null
  beforeAll(() => {
    ;({ catalogue: loaded, rules } = loadSnapshot(directory))
  })
  const priced = (book: string, datasheet: string) => {
    const catalogueId = loaded.factions.find((faction) => faction.name === book)!.id
    const entryId = [...loaded.index.datasheets.get(catalogueId)!].find(
      (id) => nameOf(loaded.index.definitions.get(id)!, loaded.index.definitions) === datasheet,
    )!
    return calculateRosterPrice(
      { catalogueId, detachmentIds: [], disposition: 'take-and-hold', limit: 2_000, units: [{ entryId }] },
      loaded,
      rules,
    )!
  }

  it('plays Take and Hold', () => {
    expect(priced('Imperium - Adeptus Titanicus', 'Warhound Titan').disposition).toBe('take-and-hold')
  })

  it('fields a Warhound in a Titanicus Traitoris army', () => {
    expect(priced('Chaos - Titanicus Traitoris', 'Warhound Titan').errors.map((error) => error.message)).not.toContain(
      'cannot be taken by this army',
    )
  })
})
