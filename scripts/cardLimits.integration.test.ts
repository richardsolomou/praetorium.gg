import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildUnit } from '../src/core/roster'
import type { LoadedCatalogue } from '../src/shared/catalogueIndex'
import { calculateRosterPrice } from '../src/shared/pricing'
import type { LoadedRules } from '../src/shared/rules'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

/** Wargear limits the unit cards print, which the limit patches in `catalogue/patches/definitions` add. */
describe.skipIf(!fs.existsSync(path.join(directory, 'definitions')))('wargear limits the cards print', () => {
  let loaded: LoadedCatalogue
  let rules: LoadedRules | null

  beforeAll(() => {
    ;({ catalogue: loaded, rules } = loadSnapshot(directory))
  })

  const catalogueOf = (entryId: string) => loaded.factions.find((faction) => loaded.index.datasheets.get(faction.id)?.has(entryId))!.id

  /** The errors of a unit of this size holding this many of one model option in place of the group's first model. */
  const errorsHolding = (entryId: string, models: number, group: string, option: string, count: number) => {
    const catalogueId = catalogueOf(entryId)
    const unit = buildUnit(entryId, loaded.index, models, {}, { primaryCatalogueId: catalogueId })!
    const choice = unit.choices.find((candidate) => candidate.name === group)!
    const spread = { [choice.options.find((candidate) => candidate.name === option)!.id]: count }
    const price = calculateRosterPrice(
      { catalogueId, detachmentIds: [], disposition: null, limit: 3000, units: [{ entryId, models, spreads: { [choice.key]: spread } }] },
      loaded,
      rules,
    )
    return price!.errors.filter((error) => error.entryName === option)
  }

  it.each([
    ['Nobz', '9c08-238c-554d-1719', 'Special Weapons', 'Nob w/ Big Choppa'],
    ['Tempestus Scions', 'fe4d-4c95-5b84-2670', 'Tempestus Scions w/ Special weapons', 'Tempestus Scion w/ Flamer'],
  ])('lets five %s take one of each special weapon, not two', (_, entryId, group, option) =>
    expect(errorsHolding(entryId, 5, group, option, 2)).toHaveLength(1),
  )

  it.each([
    ['Nobz', '9c08-238c-554d-1719', 'Special Weapons', 'Nob w/ Big Choppa'],
    ['Tempestus Scions', 'fe4d-4c95-5b84-2670', 'Tempestus Scions w/ Special weapons', 'Tempestus Scion w/ Flamer'],
  ])('lets ten %s take two of a special weapon', (_, entryId, group, option) =>
    expect(errorsHolding(entryId, 10, group, option, 2)).toHaveLength(0),
  )

  it('offers a Decimus Kill Team carbine Veteran no combat knife', () => {
    const unit = buildUnit('d41f-7e7c-18f1-4b98', loaded.index, undefined, {}, { primaryCatalogueId: catalogueOf('d41f-7e7c-18f1-4b98') })!
    expect(unit.choices.flatMap((choice) => choice.options.map((option) => option.name))).not.toContain('Combat knife')
  })
})
