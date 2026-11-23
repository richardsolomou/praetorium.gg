import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildUnit } from '../src/core/roster'
import type { LoadedCatalogue } from '../src/shared/catalogueIndex'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

/** Each datasheet's default loadout as the official app prints it, which the default patches in `catalogue/patches/definitions` correct. */
describe.skipIf(!fs.existsSync(path.join(directory, 'definitions')))('default loadouts the app prints', () => {
  let loaded: LoadedCatalogue

  beforeAll(() => {
    ;({ catalogue: loaded } = loadSnapshot(directory))
  })

  const chosen = (entryId: string, group: string) => {
    const catalogueId = loaded.factions.find((faction) => loaded.index.datasheets.get(faction.id)?.has(entryId))!.id
    const choice = buildUnit(entryId, loaded.index, undefined, {}, { primaryCatalogueId: catalogueId })!.choices.find(
      (candidate) => candidate.name === group,
    )!
    return choice.options.find((option) => option.id === choice.chosen)?.name
  }

  it.each([
    ['Captain', '91e3-a419-8c58-98f5', 'Melee Weapon', 'Master-crafted power weapon'],
    ['Wolf Guard Battle Leader', '5d5e-cd7a-4443-abfb', 'Replace Storm Shield', 'Plasma pistol'],
    ['Redemptor Dreadnought', 'fcb6-80ca-22a-4771', 'Weapon Option 3', 'Fragstorm Grenade Launchers'],
    ['Lokhust Heavy Destroyers', '654f-6cb0-c27a-2e73', '1-3 Heavy Destroyers', 'Destroyer w/ gauss destructor'],
    ['Decimus Kill Team', 'd41f-7e7c-18f1-4b98', 'Weapon', 'Infernus heavy bolter'],
    ['Wulfen with Storm Shields', 'a947-7113-3284-4248', 'Wulfen', 'Wulfen w/Auto-launcher'],
    ['Corsair Voidreavers', '94d7-39fb-35da-3a39', '4-9 Voidreavers', 'Voidreaver with sword and pistol'],
  ])('gives the %s its app default', (_, entryId, group, expected) => expect(chosen(entryId, group)).toBe(expected))
})
