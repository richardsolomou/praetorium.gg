import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { nameOf } from '../src/core/catalogue'
import { searchDatasheetEntries } from '../src/core/datasheetSearch'
import { frozenUnits } from '../src/core/rosterSnapshot'
import type { LoadedCatalogue } from '../src/server/catalogueIndex'
import { pickerUnitsFor } from '../src/shared/pickerUnits'
import { calculateRosterPrice } from '../src/shared/pricing'
import type { LoadedRules } from '../src/shared/rules'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'
const KOTC = 600

describe.skipIf(!fs.existsSync(path.join(directory, 'definitions')))('keywords a detachment grants', () => {
  let loaded: LoadedCatalogue
  let rules: LoadedRules | null
  const book = (faction: string, detachment: string, unit: string) => {
    const catalogueId = loaded.factions.find((candidate) => candidate.name === faction)!.id
    const detachmentId = loaded.detachments.get(catalogueId)!.options.find((option) => option.name === detachment)!.id
    const entryId = [...loaded.index.datasheets.get(catalogueId)!].find(
      (id) => nameOf(loaded.index.definitions.get(id)!, loaded.index.definitions) === unit,
    )!
    return { catalogueId, detachmentIds: [detachmentId], entryId }
  }
  const picker = (faction: string, detachment: string, unit: string, limit = 2000) => {
    const { catalogueId, detachmentIds, entryId } = book(faction, detachment, unit)
    return pickerUnitsFor(loaded, rules, catalogueId, '', limit, [], detachmentIds).find((candidate) => candidate.id === entryId)!
  }
  const priced = (faction: string, detachment: string, unit: string, limit = 2000) => {
    const { catalogueId, detachmentIds, entryId } = book(faction, detachment, unit)
    return calculateRosterPrice(
      { catalogueId, detachmentIds, units: [{ entryId }], disposition: null, limit, includeUnitLimits: true },
      loaded,
      rules,
    )!
  }

  beforeAll(() => {
    ;({ catalogue: loaded, rules } = loadSnapshot(directory))
  })

  it('lets the picker find the units Abhuman Auxiliaries makes Abhuman by that keyword', () => {
    const { catalogueId, detachmentIds } = book('Imperium - Astra Militarum', 'Abhuman Auxiliaries', 'Ratlings')
    const units = pickerUnitsFor(loaded, rules, catalogueId, '', 2000, [], detachmentIds)
    const found = searchDatasheetEntries(units, 'abhuman', (unit) => unit.search).map((unit) => unit.name)
    expect(found).toEqual(expect.arrayContaining(['Bullgryn Squad', 'Ogryn Squad', 'Ratlings']))
  })

  it('shelves Gretchin under Battleline in a Runt Swarm picker', () => {
    expect(picker('Xenos - Orks', 'Runt Swarm', 'Gretchin').group).toBe('battleline')
  })

  it('offers two Gretchin to a Runt Swarm King of the Colosseum list', () => {
    expect(picker('Xenos - Orks', 'Runt Swarm', 'Gretchin', KOTC).limit).toBe(2)
  })

  it('allows a second Gretchin in a Runt Swarm King of the Colosseum list already holding one', () => {
    const { entryId } = book('Xenos - Orks', 'Runt Swarm', 'Gretchin')
    expect(priced('Xenos - Orks', 'Runt Swarm', 'Gretchin', KOTC).unitLimits?.find((unit) => unit.id === entryId)?.limit).toBe(2)
  })

  it('freezes Abhuman onto Ratlings fielded from Abhuman Auxiliaries', () => {
    const { entryId } = book('Imperium - Astra Militarum', 'Abhuman Auxiliaries', 'Ratlings')
    const units = frozenUnits([{ entryId }], priced('Imperium - Astra Militarum', 'Abhuman Auxiliaries', 'Ratlings').units, [])
    expect(units[0]?.keywords).toContain('Abhuman')
  })
})
