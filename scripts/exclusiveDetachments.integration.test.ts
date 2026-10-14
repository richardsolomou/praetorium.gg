import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadCatalogue, type LoadedCatalogue } from '../src/server/catalogueIndex'
import { exclusiveDetachments } from '../src/shared/rosterDetachments'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

describe.skipIf(!fs.existsSync(path.join(directory, 'definitions')))('detachments sharing a one-per-army limit', () => {
  let loaded: LoadedCatalogue
  const necrons = () => [...loaded.index.catalogues.values()].find((catalogue) => catalogue.name === 'Xenos - Necrons')!.id
  const named = (catalogueId: string, name: string) =>
    loaded.detachments.get(catalogueId)!.options.find((option) => option.name === name)!.id

  beforeAll(() => {
    loaded = loadCatalogue(directory)!
  })

  it('pairs the two Necron Dynasty detachments under their shared limit', () => {
    const catalogueId = necrons()
    expect(exclusiveDetachments(loaded, catalogueId).get(named(catalogueId, 'Awakened Dynasty'))).toEqual([
      { id: named(catalogueId, 'Hand of the Dynasty'), limit: 'Dynasty' },
    ])
  })

  it('leaves a detachment with no shared limit free to combine', () => {
    const catalogueId = necrons()
    expect(exclusiveDetachments(loaded, catalogueId).has(named(catalogueId, 'Canoptek Court'))).toBe(false)
  })
})
