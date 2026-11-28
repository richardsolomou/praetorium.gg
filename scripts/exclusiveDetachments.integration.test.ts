import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { sharedSnapshot } from './lib/catalogueSnapshotLoad'
import { type LoadedCatalogue } from '../src/shared/catalogueIndex'
import { exclusiveDetachments } from '../src/shared/rosterDetachments'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

describe.skipIf(!fs.existsSync(path.join(directory, 'definitions')))('detachments sharing a group', () => {
  let loaded: LoadedCatalogue
  const book = (name: string) => [...loaded.index.catalogues.values()].find((catalogue) => catalogue.name === name)!.id
  const necrons = () => book('Xenos - Necrons')
  const named = (catalogueId: string, name: string) =>
    loaded.detachments.get(catalogueId)!.options.find((option) => option.name === name)!.id

  beforeAll(() => {
    loaded = sharedSnapshot(directory).catalogue
  })

  it('pairs the two Necron Dynasty detachments under their group', () => {
    const catalogueId = necrons()
    expect(exclusiveDetachments(loaded, catalogueId).get(named(catalogueId, 'Awakened Dynasty'))).toEqual([
      { id: named(catalogueId, 'Hand of the Dynasty'), limit: 'Dynasty' },
    ])
  })

  it('pairs Space Marine task forces of one group', () => {
    const catalogueId = book('Imperium - Adeptus Astartes - Space Marines')
    expect(exclusiveDetachments(loaded, catalogueId).get(named(catalogueId, 'Tacticus Attack Force'))).toEqual([
      { id: named(catalogueId, 'Tacticus Firestorm Force'), limit: 'Tacticus' },
    ])
  })

  it('leaves a detachment with no shared limit free to combine', () => {
    const catalogueId = necrons()
    expect(exclusiveDetachments(loaded, catalogueId).has(named(catalogueId, 'Canoptek Court'))).toBe(false)
  })
})
