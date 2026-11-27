import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { nameOf } from '../src/core/catalogue'
import { battleScribeRoster } from '../src/shared/battleScribeRoster'
import type { LoadedCatalogue } from '../src/shared/catalogueIndex'
import { calculateRosterPrice } from '../src/shared/pricing'
import type { LoadedRules } from '../src/shared/rules'
import { sharedSnapshot } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

describe.skipIf(!fs.existsSync(path.join(directory, 'definitions')))('a list as a BattleScribe roster file', () => {
  let loaded: LoadedCatalogue
  let rules: LoadedRules | null
  let marines: string

  /** The roster file for one army of these datasheets, each `name` or `name@models`. */
  const rosterOf = (faction: string, datasheets: string[]) => {
    const catalogueId = loaded.factions.find((candidate) => candidate.name === faction)!.id
    const entryId = (datasheet: string) =>
      [...loaded.index.datasheets.get(catalogueId)!].find(
        (id) => nameOf(loaded.index.definitions.get(id)!, loaded.index.definitions) === datasheet,
      )!
    const units = datasheets.map((datasheet) => {
      const [name, models] = datasheet.split('@')
      return { entryId: entryId(name!), ...(models ? { models: Number(models) } : {}) }
    })
    const data = { name: 'Strike force', catalogueId, detachmentIds: [], disposition: null, limit: 2000, units }
    return battleScribeRoster(data, loaded, rules, calculateRosterPrice(data, loaded, rules)!)
  }
  /** The weapon names under each model selection, in order. */
  const modelWeapons = (xml: string) =>
    [...xml.matchAll(/type="model">(.*?)(?=<selection [^>]*type="model">|<\/selections><\/selection><\/selections>|$)/g)].map(
      (model) => [...model[1]!.matchAll(/typeName="(?:Ranged|Melee) Weapons"/g)].length,
    )

  beforeAll(() => {
    ;({ catalogue: loaded, rules } = sharedSnapshot(directory))
    marines = rosterOf('Imperium - Adeptus Astartes - Space Marines', ['Intercessor Squad@10', 'Devastator Squad'])
  })

  // Yellowscribe divides a weapon's number by its model stack's to arm each model.
  it('numbers wargear by the unit total under a stack of models', () => {
    expect(marines).toMatch(/name="Intercessor" [^>]*number="9" type="model">.*?name="Bolt Rifle" [^>]*number="9"/)
  })

  it('gives every weapon a keywords characteristic', () => {
    const weapons = marines.match(/typeName="(?:Ranged|Melee) Weapons"><characteristics>.*?<\/characteristics>/g)!
    expect(weapons.filter((weapon) => !weapon.includes('name="Keywords"'))).toEqual([])
  })

  it("lists a unit's faction keyword as a category", () => {
    expect(marines).toContain('<category id="2133a4ae" name="Faction: Adeptus Astartes"')
  })

  it('carries ability descriptions only as text tokens', () => {
    const descriptions = [
      ...marines.matchAll(/<characteristic name="Description">(.*?)<\/characteristic>|<description>(.*?)<\/description>/g),
    ]
    expect(descriptions.map((match) => match[1] ?? match[2]).filter((text) => text && !/^(?:⟦[^⟧]+⟧\s*)+$/.test(text))).toEqual([])
  })

  // Its two models take the same weapons through different entries, which the sheet prints once.
  it('arms each of two models whose weapons the sheet prints once', () => {
    expect(modelWeapons(rosterOf('Xenos - Necrons', ['Canoptek Tomb Crawlers']))).not.toContain(0)
  })

  it("arms a model whose weapon the sheet leaves out, as a Subductor Squad's Cyber-mastiff", () => {
    expect(modelWeapons(rosterOf('Imperium - Astra Militarum', ['Subductor Squad']))).not.toContain(0)
  })
})
