import fs from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { nameOf } from '../src/core/catalogue'
import { sharedSnapshot } from './lib/catalogueSnapshotLoad'
import { datasheetIn } from '../src/shared/catalogue'
import { rosterCombatant } from '../src/shared/rosterCombatRules'
import type { LoadedCatalogue } from '../src/shared/catalogueIndex'

const source = process.env.CATALOGUE_DIR ?? 'catalogue-data'
const ultramarines = '4029-9237-e8db-af55'

describe.skipIf(!fs.existsSync(source))('a character whose role depends on the army', () => {
  let loaded: LoadedCatalogue
  const entryOf = (name: string) =>
    [...loaded.index.datasheets.get(ultramarines)!].find(
      (id) => nameOf(loaded.index.definitions.get(id)!, loaded.index.definitions) === name,
    )!
  const sheet = (name: string) => datasheetIn(loaded, ultramarines, entryOf(name))!

  beforeAll(() => {
    loaded = sharedSnapshot(source).catalogue
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

  it('offers the simulator each unit Cato Sicarius can join once', () => {
    const combatant = rosterCombatant(loaded, null, {
      catalogueId: ultramarines,
      detachmentIds: [],
      picks: [{ entryId: entryOf('Cato Sicarius') }],
      pickIndex: 0,
    })
    expect(combatant?.attachmentOptions.map(({ name }) => name)).toEqual(['Victrix Honour Guard'])
  })
})
