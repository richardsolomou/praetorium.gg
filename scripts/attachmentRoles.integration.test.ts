import fs from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { nameOf } from '../src/core/catalogue'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { datasheetIn } from '../src/shared/catalogue'
import type { LoadedCatalogue } from '../src/shared/catalogueIndex'

const source = process.env.CATALOGUE_DIR ?? 'catalogue-data'
const ultramarines = '4029-9237-e8db-af55'

describe.skipIf(!fs.existsSync(source))('a character whose role depends on the army', () => {
  let loaded: LoadedCatalogue
  const sheet = (name: string) => {
    const entryId = [...loaded.index.datasheets.get(ultramarines)!].find(
      (id) => nameOf(loaded.index.definitions.get(id)!, loaded.index.definitions) === name,
    )!
    return datasheetIn(loaded, ultramarines, entryId)!
  }

  beforeAll(() => {
    loaded = loadCatalogue(source)!
  })

  it('names both roles Cato Sicarius can join Victrix Honour Guard in', () => {
    expect(sheet('Cato Sicarius').attachments.map(({ kind, name }) => `${kind} ${name}`)).toEqual([
      'support Victrix Honour Guard',
      'leader Victrix Honour Guard',
    ])
  })

  it('lists Cato Sicarius among Victrix Honour Guard leaders and supporters', () => {
    const victrix = sheet('Victrix Honour Guard')
    expect([victrix.leaders, victrix.supporters].map((related) => related.some(({ name }) => name === 'Cato Sicarius'))).toEqual([
      true,
      true,
    ])
  })
})
