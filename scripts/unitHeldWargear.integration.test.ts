import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildUnit } from '../src/core/roster'
import type { LoadedCatalogue } from '../src/shared/catalogueIndex'
import { calculateRosterPrice } from '../src/shared/pricing'
import type { LoadedRules } from '../src/shared/rules'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

/** A battle's lines of models, which split off a model only for wargear a model carries, never for what the unit has. */
describe.skipIf(!fs.existsSync(path.join(directory, 'definitions')))('model lines for wargear', () => {
  let loaded: LoadedCatalogue
  let rules: LoadedRules | null

  beforeAll(() => {
    ;({ catalogue: loaded, rules } = loadSnapshot(directory))
  })

  /** The lines a unit of this datasheet is fielded with, holding one of the named option where given. */
  const linesOf = (name: string, option?: string) => {
    const faction = loaded.factions.find((candidate) =>
      [...(loaded.index.datasheets.get(candidate.id) ?? [])].some((id) => loaded.index.definitions.get(id)?.name === name),
    )!
    const entryId = [...loaded.index.datasheets.get(faction.id)!].find((id) => loaded.index.definitions.get(id)?.name === name)!
    const unit = buildUnit(entryId, loaded.index, undefined, {}, { primaryCatalogueId: faction.id })!
    const choice = option ? unit.choices.find((candidate) => candidate.options.some((held) => held.name === option)) : undefined
    const spreads = choice ? { [choice.key]: { [choice.options.find((held) => held.name === option)!.id]: 1 } } : undefined
    const price = calculateRosterPrice(
      { catalogueId: faction.id, detachmentIds: [], disposition: null, limit: 3000, units: [{ entryId, ...(spreads ? { spreads } : {}) }] },
      loaded,
      rules,
    )
    return price!.units[0]!.modelLines?.map((line) => line.name)
  }

  it.each(['Ophydian Destroyers', 'Skorpekh Destroyers'])('counts the %s with their Plasmacyte as one line of models', (name) =>
    expect(linesOf(name, 'Plasmacyte')).toBeUndefined(),
  )

  it('splits off the Possessed carrying a Chaos icon', () => expect(linesOf('Possessed', 'Chaos icon')).toContain('Chaos icon'))
})
