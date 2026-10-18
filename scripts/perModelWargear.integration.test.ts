import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { nameOf } from '../src/core/catalogue'
import type { RosterPick } from '../src/core/roster'
import type { LoadedCatalogue } from '../src/server/catalogueIndex'
import { calculateRosterPrice } from '../src/shared/pricing'
import { exportRosterFile, importRosterFile } from '../src/shared/rosterFiles'
import type { LoadedRules } from '../src/shared/rules'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

describe.skipIf(!fs.existsSync(path.join(directory, 'definitions')))('wargear chosen for several models', () => {
  let loaded: LoadedCatalogue
  let rules: LoadedRules | null
  const faction = (name: string) => loaded.factions.find((candidate) => candidate.name === name)!.id
  const datasheet = (catalogueId: string, name: string) =>
    [...loaded.index.datasheets.get(catalogueId)!].find(
      (id) => nameOf(loaded.index.definitions.get(id)!, loaded.index.definitions) === name,
    )!
  const priced = (catalogueId: string, pick: RosterPick) =>
    calculateRosterPrice({ catalogueId, detachmentIds: [], disposition: null, limit: 2000, units: [pick] }, loaded, rules)!

  beforeAll(() => {
    ;({ catalogue: loaded, rules } = loadSnapshot(directory))
  })

  it('charges a storm shield once for every Deathwatch Terminator holding one', () => {
    const catalogueId = faction('Imperium - Adeptus Astartes - Deathwatch')
    const pick = {
      entryId: datasheet(catalogueId, 'Deathwatch Terminator Squad'),
      catalogueId,
      models: 5,
      spreads: { '50fb-8de8-f1cf-86b3/45fa-9a7-8352-362e/b0bb-4681-d665-438d': { 'f831-6dfb-6b1b-8112': 4 } },
    }
    expect(priced(catalogueId, pick).points).toBe(210)
  })

  describe('a Terminator Squad with a cyclone missile launcher', () => {
    const cyclone = () => {
      const catalogueId = faction('Imperium - Adeptus Astartes - Space Marines')
      return {
        catalogueId,
        pick: {
          entryId: datasheet(catalogueId, 'Terminator Squad'),
          catalogueId,
          models: 5,
          choices: { '7f44-894b-1c97-a2dc/b3c5-2c6-4592-ba51/a21c-8de-72a4-92': '3bbd-5600-dd34-3e86' },
        },
      }
    }

    it('keeps the cyclone when the squad is also told how many of each Terminator it has', () => {
      const { catalogueId, pick } = cyclone()
      const spreads = { '7f44-894b-1c97-a2dc': { '2-e9c0-140-a1ef': 3, 'b3c5-2c6-4592-ba51': 1 } }
      expect(priced(catalogueId, { ...pick, spreads }).points).toBe(200)
    })

    it('keeps the cyclone through its own text export', () => {
      const { catalogueId, pick } = cyclone()
      const roster = { catalogueId, detachmentIds: [], disposition: null, limit: 2000, name: 'Cyclone check', units: [pick] }
      const price = priced(catalogueId, pick)
      const { text } = exportRosterFile(roster, loaded, { ...price, disposition: price.disposition ?? null }, [])
      expect(importRosterFile({ file: text }, loaded, undefined, rules).currentPoints).toBe(200)
    })

    it('keeps the cyclone from a New Recruit list', () => {
      const file = `Cyclone check (200 Points)

Space Marines
Gladius Task Force (1 Detachment Points)
Take and Hold
Strike Force (2,000 Points)

OTHER DATASHEETS

Terminator Squad (200 Points)
  • 1x Terminator Sergeant
     ◦ 1x Power weapon
     ◦ 1x Storm bolter
  • 4x Terminator
     ◦ 1x Cyclone missile launcher
     ◦ 3x Power fist
     ◦ 1x Power fist
     ◦ 4x Storm bolter

Exported with New Recruit v36.49, Data Version: v2`
      expect(importRosterFile({ file }, loaded, undefined, rules).currentPoints).toBe(200)
    })
  })
})
