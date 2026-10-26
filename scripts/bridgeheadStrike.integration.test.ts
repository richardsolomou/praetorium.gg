import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { joinableUnits } from '../src/core/attachmentOptions'
import { fieldedUnits, startingEmbarkRefusal } from '../src/core/battle'
import { frozenUnits } from '../src/core/rosterSnapshot'
import { nameOf } from '../src/core/catalogue'
import type { RosterPick } from '../src/core/roster'
import type { LoadedCatalogue } from '../src/server/catalogueIndex'
import { unitBattleDetailsIn } from '../src/shared/catalogue'
import { calculateRosterPrice } from '../src/shared/pricing'
import { rosterCombatant } from '../src/shared/rosterCombatRules'
import type { LoadedRules } from '../src/shared/rules'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'
const scionWarlord = '13ae-9951-4da9-9837/1999-fec0-869b-8e2/264d-bd86-d12-3bf1'

describe.skipIf(!fs.existsSync(path.join(directory, 'definitions')))('Bridgehead Strike with a Tempestor Prime Warlord', () => {
  let loaded: LoadedCatalogue
  let rules: LoadedRules | null
  let militarum: string
  const datasheet = (catalogueId: string, name: string) =>
    [...loaded.index.datasheets.get(catalogueId)!].find(
      (id) => nameOf(loaded.index.definitions.get(id)!, loaded.index.definitions) === name,
    )!
  const roster = (warlord: boolean) => {
    const agents = loaded.factions.find((faction) => faction.name === 'Imperium - Agents of the Imperium')!.id
    const units: RosterPick[] = [
      {
        entryId: datasheet(militarum, 'Militarum Tempestus Command Squad'),
        ...(warlord ? { toggles: { [scionWarlord]: 1 } } : {}),
      },
      { entryId: datasheet(militarum, 'Tempestus Scions') },
      { entryId: datasheet(agents, 'Inquisitor Coteaz'), catalogueId: agents, attachedTo: 1 },
      { entryId: datasheet(militarum, 'Chimera') },
    ]
    const detachmentIds = [loaded.detachments.get(militarum)!.options.find((option) => option.name === 'Bridgehead Strike')!.id]
    return { catalogueId: militarum, detachmentIds, units }
  }
  const priced = (warlord: boolean) => calculateRosterPrice({ ...roster(warlord), disposition: null, limit: 2000 }, loaded, rules)!
  const simulated = (warlord: boolean) => {
    const { units, ...data } = roster(warlord)
    return rosterCombatant(loaded, rules, { ...data, picks: units, pickIndex: 1 })!
  }

  beforeAll(() => {
    ;({ catalogue: loaded, rules } = loadSnapshot(directory))
    militarum = loaded.factions.find((faction) => faction.name === 'Imperium - Astra Militarum')!.id
  })

  it('shelves Tempestus Scions as Battleline', () => {
    expect(priced(true).units[1]?.group).toBe('battleline')
  })

  it('offers Inquisitor Coteaz Tempestus Scions to lead', () => {
    const { units } = priced(true)
    expect(
      joinableUnits(
        units.map(({ key }) => ({ key })),
        units,
        2,
      ).map(({ name }) => name),
    ).toContain('Tempestus Scions')
  })

  it('accepts Inquisitor Coteaz leading Tempestus Scions', () => {
    expect(priced(true).errors.filter((error) => error.entryName === 'Inquisitor Coteaz')).toEqual([])
  })

  it('simulates Tempestus Scions led by Inquisitor Coteaz', () => {
    expect(simulated(true).attachmentErrors).toEqual([])
  })

  it('embarks Tempestus Scions led by Inquisitor Coteaz in a Chimera', () => {
    const { units } = roster(true)
    const fielded = fieldedUnits(
      frozenUnits(
        units,
        priced(true).units,
        unitBattleDetailsIn(
          loaded,
          militarum,
          units.map(({ entryId }) => entryId),
        ),
      ),
    )
    const key = (name: string) => fielded.find((unit) => unit.name === name)!.key
    expect(startingEmbarkRefusal(fielded, key('Tempestus Scions'), key('Chimera'))).toBeNull()
  })

  it('refuses to simulate Inquisitor Coteaz leading Tempestus Scions without a Tempestus Warlord', () => {
    expect(simulated(false).attachmentErrors.map((error) => error.message)).toEqual(['cannot be attached to Tempestus Scions'])
  })

  it('keeps Tempestus Scions Infantry without a Tempestus Warlord', () => {
    expect(priced(false).units[1]?.group).toBe('infantry')
  })

  it('refuses Inquisitor Coteaz leading Tempestus Scions without a Tempestus Warlord', () => {
    expect(priced(false).errors.map((error) => error.message)).toContain('cannot be attached to Tempestus Scions')
  })
})
