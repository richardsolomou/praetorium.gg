import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { RosterPick } from '../src/core/roster'
import { priceVsRoster } from '../src/core/vsDataRoster'
import { hasWarlordToggle } from '../src/core/unitChoices'
import type { LoadedCatalogue } from '../src/shared/catalogueIndex'
import { calculateRosterPrice } from '../src/shared/pricing'
import type { LoadedRules } from '../src/shared/rules'
import { vsDefinitionsOf } from '../src/shared/vsDataBuild'
import { sharedSnapshot } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'
const terminators = '13d8-1933-472c-80ed'
const captain = '91e3-a419-8c58-98f5'
const legends = '1bb6-f47f-34a2-7796'
const squad = 'space-marines.terminator-squad'

describe.skipIf(!fs.existsSync(path.join(directory, 'definitions')))('a pick fielded by VS Data IDs', () => {
  let loaded: LoadedCatalogue
  let rules: LoadedRules | null
  let list: { catalogueId: string; detachmentIds: string[] }
  const priced = (...units: RosterPick[]) => calculateRosterPrice({ ...list, disposition: null, limit: 2000, units }, loaded, rules)!.units
  const heavyFlamer = {
    models: { [`${squad}.terminator`]: 9, [`${squad}.terminator-sergeant`]: 1 },
    options: { [`${squad}.terminator-loadout`]: { [`${squad}.heavy-flamer`]: 1 } },
  }

  beforeAll(() => {
    ;({ catalogue: loaded, rules } = sharedSnapshot(directory))
    const catalogueId = loaded.factions.find((faction) => faction.name === 'Imperium - Adeptus Astartes - Space Marines')!.id
    list = { catalogueId, detachmentIds: [loaded.detachments.get(catalogueId)!.options[0]!.id] }
  })

  it('costs what VS Data prices its loadout at', () => {
    const vs = priceVsRoster(vsDefinitionsOf(loaded)!, {
      faction: 'space-marines',
      detachments: [loaded.vsRoster!.detachments[list.detachmentIds[0]!]!],
      units: [{ unit: squad, ...heavyFlamer }],
    })
    expect(priced({ entryId: terminators, vs: heavyFlamer })[0]!.points).toBe(vs.units[0]!.points)
  })

  it('fields the size its models add up to', () => {
    expect(priced({ entryId: terminators, vs: heavyFlamer })[0]!.size.models).toBe(10)
  })

  it('carries the wargear its selections give', () => {
    expect(priced({ entryId: terminators, vs: heavyFlamer })[0]!.wargear).toContainEqual({ name: 'Heavy Flamer', count: 1 })
  })

  it('lines up the model that took the swap apart from the rest', () => {
    expect(priced({ entryId: terminators, vs: heavyFlamer })[0]!.modelLines?.map((line) => line.models)).toEqual([8, 1, 1])
  })

  it('holds the Warlord its Warlord model names', () => {
    const vs = { models: {}, options: {}, warlord: 'space-marines.captain.captain' }
    expect(hasWarlordToggle(priced({ entryId: captain, vs })[0]!.toggles)).toBe(true)
  })

  it('keeps the keyword naming its datasheet', () => {
    expect(priced({ entryId: terminators, vs: heavyFlamer })[0]!.keywords).toContain('Terminator Squad')
  })

  it('names an Enhancement of a Detachment the list does not take', () => {
    const vs = { models: {}, options: {}, enhancement: 'space-marines.assault-brethren.imperiums-sword' }
    const other = loaded.detachments.get(list.catalogueId)!.options.find((option) => option.name !== 'Assault Brethren')!
    const units = calculateRosterPrice(
      { ...list, detachmentIds: [other.id], disposition: null, limit: 2000, units: [{ entryId: captain, vs }] },
      loaded,
      rules,
    )!.units
    expect(units[0]!.enhancements).toEqual(['Imperium’s Sword'])
  })

  it('builds from the catalogue where VS Data does not field the datasheet', () => {
    const vs = { models: { nothing: 3 }, options: {} }
    expect(priced({ entryId: legends, vs })[0]!.size.models).toBe(priced({ entryId: legends })[0]!.size.models)
  })
})
