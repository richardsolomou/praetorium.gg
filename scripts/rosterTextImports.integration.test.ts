import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  listForgeDetailed,
  listForgeWtc,
  listForgeAllies,
  listForgePiranhas,
  listForgeWtcKeyword,
  warmind,
  warmindListForge,
  warmindWtc,
  warmindOfficial,
} from '../src/core/rosterText.fixtures'
import type { LoadedCatalogue } from '../src/server/catalogueIndex'
import { custodesOfficial } from '../src/core/rosterText.custodes.fixture'
import type { LoadedRules } from '../src/shared/rules'
import { calculateRosterPrice } from '../src/shared/pricing'
import { importRosterFile } from '../src/shared/rosterFiles'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'

const source = process.env.CATALOGUE_DIR ?? 'catalogue-data'

describe.skipIf(!fs.existsSync(source))('genuine exports from other army builders', () => {
  let catalogue: LoadedCatalogue
  let rules: LoadedRules | null
  beforeAll(() => {
    ;({ catalogue, rules } = loadSnapshot(path.resolve(source)))
  })
  const imported = (file: string) => importRosterFile({ file }, catalogue, undefined, rules)
  const summary = (file: string) => {
    const result = imported(file)
    return {
      format: result.format,
      faction: result.catalogueName,
      detachments: result.detachmentIds.length,
      units: `${result.units.length} of ${result.sourceUnitCount}`,
      attached: result.units.filter((unit) => unit.attachedTo !== undefined).length,
      mismatches: [...result.unknown, ...result.unplaced],
      points: `${result.currentPoints} for ${result.reportedPoints}`,
    }
  }

  it.each([
    ['listForgeDetailed', listForgeDetailed, 'listforge', 'Xenos - Drukhari', 2, '6 of 6', 2, '510 for 510'],
    ['listForgeWtc', listForgeWtc, 'listforge-wtc', 'Xenos - Drukhari', 2, '6 of 6', 2, '510 for 510'],
    ['listForgeAllies', listForgeAllies, 'listforge', 'Imperium - Grey Knights', 1, '2 of 2', 0, '285 for 285'],
    ['listForgePiranhas', listForgePiranhas, 'listforge', "Xenos - T'au Empire", 2, '1 of 1', 0, '65 for 65'],
    ['listForgeWtcKeyword', listForgeWtcKeyword, 'listforge-wtc', 'Chaos - Chaos Daemons', 1, '2 of 2', 0, '685 for 685'],
    ['warmind', warmind, 'warmind', 'Xenos - Drukhari', 2, '6 of 6', 2, '510 for 510'],
    // Warmind's ListForge and tournament texts do not say who leads whom.
    ['warmindListForge', warmindListForge, 'listforge', 'Xenos - Drukhari', 2, '4 of 4', 0, '350 for 350'],
    ['warmindWtc', warmindWtc, 'wtc', 'Xenos - Drukhari', 2, '4 of 4', 0, '350 for 350'],
    ['warmindOfficial', warmindOfficial, 'roster-file', 'Xenos - Drukhari', 2, '4 of 4', 1, '350 for 350'],
  ] as const)(
    'imports %s with every unit, detachment and attachment',
    (_name, file, format, faction, detachments, units, attached, points) => {
      expect(summary(file)).toEqual({ format, faction, detachments, units, attached, mismatches: [], points })
    },
  )

  const priced = (file: string) => {
    const result = imported(file)
    return calculateRosterPrice(
      { catalogueId: result.catalogueId!, detachmentIds: result.detachmentIds, disposition: null, limit: 2000, units: result.units },
      catalogue,
      rules,
    )
  }
  const wargear = (file: string, unit: string) => {
    const held = priced(file)?.units.find((candidate) => candidate.name === unit)?.wargear ?? []
    return held.map((piece) => `${piece.count}x ${piece.name.toLowerCase()}`)
  }

  it("keeps a Hekatrix's stated pistol", () => {
    expect(wargear(listForgeDetailed, 'Wyches')).toContain('1x blast pistol')
  })

  it("keeps both of a Piranha's stated seeker missiles", () => {
    expect(wargear(listForgePiranhas, 'Piranhas')).toContain('2x seeker missile')
  })

  // Warmind's ListForge and official-app layouts state no model count, and a Wyches squad is always ten.
  const wychesLoadout = ['7x Splinter Pistol', '3x Gladiatorial Weapons', '7x Hekatarii Blade']
  const wychesFrom = {
    warmindListForge: `Wyches - Drukhari - Exhibition of Slaughter (90 Points)\n\nBattle Size: Strike Force (2000 point limit)\n\nBattleline:\nWyches (90 pts)\n• B: ${wychesLoadout.join(', ')}`,
    warmindOfficial: `Wyches (90 points)\n\nDrukhari\nExhibition of Slaughter (1 Detachment Point)\nStrike Force (2000 points)\n\nBATTLELINE\n\nWyches (90 points)\n${wychesLoadout.map((line) => `  • ${line}`).join('\n')}\n`,
  }

  it.each(Object.entries(wychesFrom))('imports Wyches from %s without a mismatch', (_name, file) => {
    expect(summary(file).mismatches).toEqual([])
  })

  it.each(Object.entries(wychesFrom))('keeps all three Gladiatorial Weapons in Wyches from %s', (_name, file) => {
    expect(wargear(file, 'Wyches')).toContain('3x gladiatorial weapons')
  })

  // Agents of the Imperium hold the Simulacrum Sanctifier on the datasheet, outside any group.
  const alliedSanctifiers = `Sanitised list - Grey Knights - Take and Hold - Warpbane Task Force (100 Points)


Allies: Imperial Agents:
Sanctifiers (100 pts)
  • Death Cult Assassin
    • Death Cult blades
  • Miraculist
    • Burning hands
    • Holy fire
  • Missionary w/ flamer
    • Ministorum flamer
    • Sanctifier melee weapon
  • Missionary w/ plasma gun
    • Plasma gun
    • Sanctifier melee weapon
  • Salvationist
    • Close combat weapon
    • Salvationist Medikit
  • 3x Sanctifier w/ hand flamer
    • 3x Ministorum hand flamer
    • 3x Sanctifier melee weapon
  • Sanctifier w/ simulacrum imperialis
    • Close combat weapon
    • Ministorum hand flamer
    • Simulacrum Imperialis
`

  it('places an allied Simulacrum Sanctifier', () => {
    expect(summary(alliedSanctifiers).mismatches).toEqual([])
  })

  it('arms an allied Simulacrum Sanctifier', () => {
    expect(wargear(alliedSanctifiers, 'Sanctifiers')).toContain('1x simulacrum imperialis')
  })

  it('imports the reported official-app Custodes roster without mismatches', () => {
    expect(summary(custodesOfficial)).toEqual({
      format: 'roster-file',
      faction: 'Imperium - Adeptus Custodes',
      detachments: 3,
      units: '10 of 10',
      attached: 2,
      mismatches: [],
      points: '2000 for 2000',
    })
  })

  it('preserves the reported Custodes model counts', () => {
    expect(imported(custodesOfficial).units.map((unit) => unit.models)).toEqual([1, 3, 1, 3, 2, 1, 1, 1, 4, 4])
  })

  it('arms the reported Achillus with both Adrathic combi-destructors', () => {
    expect(wargear(custodesOfficial, 'Contemptor-Achillus Dreadnought')).toContain('2x adrathic combi-destructors')
  })

  it.each([
    ['Shield-Captain', 'Auric Exemplar'],
    ['Blade Champion', 'Flawless Bladework'],
  ])('keeps the reported enhancement on %s', (unit, enhancement) => {
    const found = priced(custodesOfficial)?.units.find((candidate) => candidate.name === unit)
    expect(found?.enhancements).toContain(enhancement)
  })

  it.each([
    ['Contemptor-Achillus Dreadnought', '1x memento moritoi (upgrade)'],
    ['Telemon Heavy Dreadnought', '1x augury uplink (upgrade)'],
  ])('keeps the reported upgrade on %s', (unit, upgrade) => {
    expect(wargear(custodesOfficial, unit)).toContain(upgrade)
  })
})
