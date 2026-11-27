import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { nameOf } from '../src/core/catalogue'
import { buildUnit } from '../src/core/roster'
import { wargearOf } from '../src/core/wargear'
import type { LoadedCatalogue } from '../src/shared/catalogueIndex'
import { sharedSnapshot } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

describe.skipIf(!fs.existsSync(path.join(directory, 'definitions')))('options and size-bound wargear a datasheet builds with', () => {
  let loaded: LoadedCatalogue

  beforeAll(() => {
    ;({ catalogue: loaded } = sharedSnapshot(directory))
  })

  const built = (factionName: string, datasheet: string, models?: number) => {
    const catalogueId = loaded.factions.find((candidate) => candidate.name === factionName)!.id
    const entryId = [...loaded.index.datasheets.get(catalogueId)!].find(
      (id) => nameOf(loaded.index.definitions.get(id)!, loaded.index.definitions) === datasheet,
    )!
    return buildUnit(entryId, loaded.index, models, {}, { primaryCatalogueId: catalogueId })!
  }
  const offered = (factionName: string, datasheet: string, choice: string) =>
    built(factionName, datasheet)
      .choices.filter((candidate) => candidate.name === choice)
      .flatMap((candidate) => candidate.options.map((option) => option.name))

  it('offers Death Company Intercessors the alternate-pistol model', () => {
    expect(offered('Imperium - Adeptus Astartes - Blood Angels', 'Death Company Intercessors', 'Death Company Intercessors')).toContain(
      'Intercessor w/ alternate pistol',
    )
  })

  it('offers the Yaegir Theyn a bolt revolver and plasma knife', () => {
    expect(offered('Xenos - Leagues of Votann', 'Hernkyn Yaegirs', 'Weapon')).toContain('Bolt revolver and plasma knife')
  })

  it('offers the Intercessor Sergeant a plasma pistol', () => {
    expect(offered('Imperium - Adeptus Astartes - Space Marines', 'Intercessor Squad', 'Weapon 1')).toContain('Plasma pistol')
  })

  it('offers a Spectrus Kill Team its helix gauntlet', () => {
    expect(offered('Imperium - Adeptus Astartes - Deathwatch', 'Spectrus Kill Team', 'Squad Members')).toContain(
      'Kill Team Infiltrator w/ helix gauntlet',
    )
  })

  it.each(['Skorpekh Destroyers', 'Ophydian Destroyers'])('gives %s a Plasmacyte for every three models', (datasheet) => {
    const plasmacytes = (models: number) => {
      const unit = built('Xenos - Necrons', datasheet, models)
      return wargearOf(unit.selection, loaded.index).find((wargear) => wargear.name === 'Plasmacyte')?.count
    }
    expect([3, 6].map(plasmacytes)).toEqual([1, 2])
  })
})
