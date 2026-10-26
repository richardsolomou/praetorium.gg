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
import { astraMilitarumNewRecruit, kriegGermanOfficial } from '../src/core/rosterText.krieg.fixture'
import { necronsOfficial } from '../src/core/rosterText.necrons.fixture'
import { blackTemplarsNewRecruit } from '../src/core/rosterText.blackTemplars.fixture'
import { chaosSpaceMarinesNewRecruit } from '../src/core/rosterText.chaosSpaceMarines.fixture'
import { bloodAngelsOfficial } from '../src/core/rosterText.bloodAngels.fixture'
import { salamandersOfficial } from '../src/core/rosterText.salamanders.fixture'
import { spaceWolvesOfficial } from '../src/core/rosterText.spaceWolves.fixture'
import { whiteScarsOfficialFlattened } from '../src/core/rosterText.whiteScars.fixture'
import { nameOf } from '../src/core/catalogue'
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
    [
      'blackTemplarsNewRecruit',
      blackTemplarsNewRecruit,
      'roster-file',
      'Imperium - Adeptus Astartes - Black Templars',
      3,
      '16 of 16',
      5,
      '2000 for 2000',
    ],
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

  // Skitarii Rangers hold their specialists in a group beside the galvanic-rifle Rangers they replace.
  const skitariiRangers = `Adeptus Mechanicus
Lords of the Forge (3 Detachment Points)
Strike Force (2,000 Points)

BATTLELINE

Skitarii Rangers (85 Points)
• 1x Skitarii Ranger Alpha
◦ 1x Alpha combat weapon
◦ 1x Close combat weapon
◦ 1x Galvanic rifle
• 9x Skitarii Ranger
◦ 1x Arc rifle
◦ 9x Close combat weapon
◦ 6x Galvanic rifle
◦ 1x Omnispex
◦ 1x Plasma caliver
◦ 1x Transuranic arquebus
`

  it('places every Skitarii Rangers specialist', () => {
    expect(summary(skitariiRangers).mismatches).toEqual([])
  })

  it('takes the galvanic rifles of the Skitarii Rangers each specialist replaces', () => {
    expect(wargear(skitariiRangers, 'Skitarii Rangers')).toContain('7x galvanic rifle')
  })

  // The official app names Scion specialists by their kind, and Aquilons fill their group with a model it does not offer.
  const tempestus = {
    'Militarum Tempestus Command Squad': `Astra Militarum
Combined Arms (1 Detachment Point)
Strike Force (2,000 Points)

OTHER DATASHEETS

Militarum Tempestus Command Squad (100 Points)
• 1x Tempestor Prime
◦ 1x Plasma pistol
◦ 1x Tempestus dagger
• 4x Tempestus Scion
◦ 4x Close combat weapon
◦ 2x Hot-shot laspistol
◦ 1x Medi-pack
◦ 1x Master vox
◦ 1x Meltagun
◦ 1x Hot-shot lasgun
`,
    'Tempestus Aquilons': `Astra Militarum
Combined Arms (1 Detachment Point)
Strike Force (2,000 Points)

OTHER DATASHEETS

Tempestus Aquilons (95 Points)
• 1x Tempestor Aquilon
◦ 1x Close combat weapon
◦ 1x Hot-shot lascarbine
◦ 1x Sentry flamer
• 9x Tempestus Aquilon
◦ 9x Close combat weapon
◦ 7x Hot-shot lascarbine
◦ 1x Plasma carbine
◦ 1x Hot-shot long las
`,
  }

  it.each(Object.entries(tempestus))('places every %s specialist', (_name, file) => {
    expect(summary(file).mismatches).toEqual([])
  })

  // A list naming each Terminator variant apart already places their wargear; the squad's group must not reread it.
  it('keeps a plain Terminator when the list names the squad variants apart', () => {
    const file = `Grey Knights
Augurium Task Force (1 Detachment Point)
Strike Force (2,000 Points)

OTHER DATASHEETS

Grey Knights Terminator Squad (185 Points)
• 1x Terminator Justicar
◦ 1x Storm bolter
◦ 1x Nemesis force weapon
• 1x Terminator
◦ 1x Storm bolter
◦ 1x Nemesis force weapon
• 2x Terminator w/ heavy weapon
◦ 1x Psilencer
◦ 2x Nemesis force weapon
◦ 1x Incinerator
• 1x Terminator w/ narthecium
◦ 1x Narthecium
◦ 1x Nemesis force weapon
`
    const { definitions } = catalogue.index
    const fielded = Object.values(imported(file).units[0]!.spreads).flatMap((spread) =>
      Object.entries(spread).flatMap(([id, count]) => (count > 0 ? [`${count}x ${nameOf(definitions.get(id)!, definitions)}`] : [])),
    )
    expect(fielded).toContain('1x Terminator')
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

  it('imports the reported official-app Space Wolves roster without mismatches', () => {
    expect(summary(spaceWolvesOfficial)).toEqual({
      format: 'roster-file',
      faction: 'Imperium - Adeptus Astartes - Space Wolves',
      detachments: 3,
      units: '15 of 15',
      attached: 3,
      mismatches: [],
      points: '2000 for 2000',
    })
  })

  // The official app writes "Chainsword" where the catalogue writes "Astartes Chainsword".
  it('imports the reported official-app Blood Angels roster without mismatches', () => {
    expect(summary(bloodAngelsOfficial)).toEqual({
      format: 'roster-file',
      faction: 'Imperium - Adeptus Astartes - Blood Angels',
      detachments: 3,
      units: '12 of 12',
      attached: 3,
      mismatches: [],
      points: '2000 for 2000',
    })
  })

  it('arms the Wolf Guard Pack Leader with the Relic Greataxe the catalogue spells Relic Great Axe', () => {
    expect(wargear(spaceWolvesOfficial, 'Wolf Guard Terminators')).toContain('1x relic great axe')
  })

  it('reads an Eradicator listed with a multi-melta as the Eradicator with Multi-melta', () => {
    expect(wargear(spaceWolvesOfficial, 'Eradicator Squad with Melta Rifles')).toContain('1x multi-melta')
  })

  it('counts the Thunderwolf Cavalry Pack Leader among its models', () => {
    expect(imported(spaceWolvesOfficial).units.at(-1)?.models).toBe(6)
  })

  it('imports official-app Necrons with every leader and support attachment', () => {
    expect(summary(necronsOfficial)).toEqual({
      format: 'roster-file',
      faction: 'Xenos - Necrons',
      detachments: 1,
      units: '7 of 7',
      attached: 3,
      mismatches: [],
      points: '1000 for 1000',
    })
  })

  it('imports the reported official-app Salamanders roster with both detachments and all attachments', () => {
    expect(summary(salamandersOfficial)).toEqual({
      format: 'roster-file',
      faction: 'Imperium - Adeptus Astartes - Salamanders',
      detachments: 2,
      units: '12 of 12',
      attached: 4,
      mismatches: [],
      points: '1435 for 1435',
    })
  })

  it('imports the reported official-app White Scars roster pasted without blank lines or price brackets', () => {
    expect(summary(whiteScarsOfficialFlattened)).toEqual({
      format: 'roster-file',
      faction: 'Imperium - Adeptus Astartes - White Scars',
      detachments: 2,
      units: '18 of 18',
      attached: 4,
      mismatches: [],
      points: '2000 for null',
    })
  })

  it('places the reported Chaos Space Marines loadouts that share their weapons', () => {
    expect(summary(chaosSpaceMarinesNewRecruit)).toEqual({
      format: 'roster-file',
      faction: 'Chaos - Chaos Space Marines',
      detachments: 1,
      units: '7 of 7',
      attached: 1,
      mismatches: [],
      points: '995 for 995',
    })
  })

  it('keeps the catalogue IDs of both reported Salamanders detachments', () => {
    expect(imported(salamandersOfficial).detachmentIds).toEqual(['5eb6-4ed2-6aca-c7f1', 'e073-8fe8-5b59-48f0'])
  })

  it('still imports the annotated Deathwatch Support source label', () => {
    expect(imported(salamandersOfficial.replace('Deathwatch Support and', 'Deathwatch Support (ITS NOT READY) and')).detachmentIds).toEqual(
      ['5eb6-4ed2-6aca-c7f1', 'e073-8fe8-5b59-48f0'],
    )
  })

  it('prices both Salamanders detachments against their source names', () => {
    expect(priced(salamandersOfficial)?.detachments).toEqual([
      { name: 'Deathwatch Support', points: 1 },
      { name: "Forgefather's Seekers", points: 2 },
    ])
  })

  it('imports the reported German official-app Krieg roster without mismatches', () => {
    expect(summary(kriegGermanOfficial)).toEqual({
      format: 'roster-file',
      faction: 'Imperium - Astra Militarum',
      detachments: 1,
      units: '20 of 20',
      attached: 2,
      mismatches: [],
      points: '1995 for 1995',
    })
  })

  it('imports the New Recruit Astra Militarum list without a mismatch', () => {
    expect(summary(astraMilitarumNewRecruit)).toEqual({
      format: 'roster-file',
      faction: 'Imperium - Astra Militarum',
      detachments: 1,
      units: '11 of 11',
      attached: 3,
      mismatches: [],
      points: '1000 for 1000',
    })
  })

  // Their pistol and melee swaps sit inside the loadout their wargear group picks, seven containers below the datasheet.
  it.each(['2x plasma pistol', '2x power weapon'])("keeps the Death Korps Watchmasters' %s", (equipment) => {
    expect(wargear(astraMilitarumNewRecruit, 'Death Korps of Krieg')).toContain(equipment)
  })

  // The Lord Commissar's default power weapon, swapped for the stated power fist, is not the one the list states.
  it("gives a Krieg veteran the list's power weapon", () => {
    expect(wargear(astraMilitarumNewRecruit, 'Krieg Command Squad')).toContain('1x power weapon')
  })

  it('reports a stated weapon its unit lost though a group bears its name', () => {
    const both = astraMilitarumNewRecruit.replace(
      '◦ 1x Power weapon\n◦ 1x Regimental',
      '◦ 1x Power weapon\n◦ 1x Trench club\n◦ 1x Regimental',
    )
    expect(imported(both).unplaced.flatMap((unit) => unit.choices.map((choice) => choice.name))).toEqual(['Power weapon'])
  })

  it('takes the German Krieg force disposition from its detachment', () => {
    expect(imported(kriegGermanOfficial)).toMatchObject({ disposition: 'disruption' })
  })

  it('preserves the official Necrons model counts', () => {
    expect(imported(necronsOfficial).units.map((unit) => unit.models)).toEqual([1, 3, 1, 6, 1, 6, 1])
  })

  it.each([
    ['Lokhust Heavy Destroyers', '3x gauss destructor'],
    ['Lokhust Destroyers', '6x gauss cannon'],
    ['Skorpekh Destroyers', '6x skorpekh hyperphase weapons'],
    ['Skorpekh Destroyers', '2x plasmacyte'],
  ])('keeps the official Necrons equipment on %s: %s', (unit, equipment) => {
    expect(wargear(necronsOfficial, unit)).toContain(equipment)
  })

  it.each([
    ['Chronomancer', 'Murdermind'],
    ['Skorpekh Lord', 'Mark of the Nekrosor'],
  ])('keeps the official Necrons enhancement on %s', (unit, enhancement) => {
    expect(priced(necronsOfficial)?.units.find((candidate) => candidate.name === unit)?.enhancements).toContain(enhancement)
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
