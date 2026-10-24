import fs from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { attachmentOf } from '../src/core/attach'
import { nameOf } from '../src/core/catalogue'
import { loadCatalogue, type LoadedCatalogue } from '../src/server/catalogueIndex'

const source = process.env.CATALOGUE_DIR ?? 'catalogue-data'

describe.skipIf(!fs.existsSync(source))('Crucible Tacticus leaders', () => {
  let loaded: LoadedCatalogue
  const datasheet = (name: string) =>
    [...loaded.index.definitions.values()].find((entry) => entry.type && nameOf(entry, loaded.index.definitions) === name)!

  beforeAll(() => {
    loaded = loadCatalogue(source)!
  })

  it.each(['Champion of the Chapter [Crucible]', 'Librarius Adept [Crucible]'])('%s cannot lead a Character unit', (name) => {
    const leader = datasheet(name)

    expect(attachmentOf(leader, loaded.index, { id: leader.id })?.targets).not.toContain('Captain')
  })

  it.each(['Champion of the Chapter [Crucible]', 'Librarius Adept [Crucible]'])(
    '%s cannot lead a unit whose Character keyword is on its model',
    (name) => {
      const leader = datasheet(name)

      expect(attachmentOf(leader, loaded.index, { id: leader.id })?.targets).not.toContain('Chaplain Grimaldus')
    },
  )

  it.each(['Champion of the Chapter [Crucible]', 'Librarius Adept [Crucible]'])('%s still leads Tacticus squads', (name) => {
    const leader = datasheet(name)

    expect(attachmentOf(leader, loaded.index, { id: leader.id })?.targets).toContain('Intercessor Squad')
  })
})
