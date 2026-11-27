import fs from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { nameOf } from '../src/core/catalogue'
import { sharedSnapshot } from './lib/catalogueSnapshotLoad'
import { datasheetsOf, type LoadedCatalogue } from '../src/shared/catalogueIndex'
import { keywordsIn } from '../src/shared/catalogue'

const source = process.env.CATALOGUE_DIR ?? 'catalogue-data'

describe.skipIf(!fs.existsSync(source))('unit keywords from their models', () => {
  let loaded: LoadedCatalogue
  const keywordsOf = (name: string) => {
    for (const catalogueId of loaded.index.datasheets.keys()) {
      for (const id of datasheetsOf(loaded.index, catalogueId)) {
        const entry = loaded.index.definitions.get(id)!
        if (nameOf(entry, loaded.index.definitions) === name) return keywordsIn(loaded, catalogueId, id)
      }
    }
    throw new Error(`no datasheet named ${name}`)
  }

  beforeAll(() => {
    loaded = sharedSnapshot(source).catalogue
  })

  it('makes Chaplain Grimaldus a Character unit', () => {
    expect(keywordsOf('Chaplain Grimaldus')).toContain('Character')
  })

  it('keeps Canis Rex a Vehicle without its embarked pilot making it Infantry', () => {
    expect(keywordsOf('Canis Rex')).not.toContain('Infantry')
  })
})
