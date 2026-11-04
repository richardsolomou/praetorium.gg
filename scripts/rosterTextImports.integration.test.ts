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
import { custodesFortyKApp, custodesOfficial } from '../src/core/rosterText.custodes.fixture'
import { astraMilitarumNewRecruit, kriegGermanOfficial } from '../src/core/rosterText.krieg.fixture'
import { necronsOfficial } from '../src/core/rosterText.necrons.fixture'
import { blackTemplarsNewRecruit } from '../src/core/rosterText.blackTemplars.fixture'
import { chaosSpaceMarinesNewRecruit } from '../src/core/rosterText.chaosSpaceMarines.fixture'
import { bloodAngelsOfficial } from '../src/core/rosterText.bloodAngels.fixture'
import { salamandersOfficial } from '../src/core/rosterText.salamanders.fixture'
import { spaceWolvesFortyKApp, spaceWolvesFortyKAppGrouped, spaceWolvesOfficial } from '../src/core/rosterText.spaceWolves.fixture'
import { agentsFortyKApp } from '../src/core/rosterText.agents.fixture'
import { spaceMarinesFortyKAppMarkdown } from '../src/core/rosterText.spaceMarines.fixture'
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

  const official = (faction: string, detachment: string, unit: string) =>
    `List (2000 points)\n\n${faction}\n${detachment} (3 Detachment Points)\nPurge the Foe\nStrike Force (2000 points)\n\nOTHER DATASHEETS\n\n${unit}\n`

  // The official app names models its own way: these are the shapes of real tournament lists.
  it.each([
    [
      'an Ork plural',
      'Orks',
      'War Horde',
      'Flash Gitz (150 points)\n  • 9x Flash Git\n    • 9x Choppa\n      9x Snazzgun\n  • 1x Kaptin\n    • 1x Choppa\n      1x Snazzgun',
    ],
    [
      'a keyword prefix',
      'Chaos Space Marines',
      'Veterans of the Long War',
      'Cultist Mob (50 points)\n  • 1x Cultist Champion\n    • 1x Autopistol\n      1x Brutal assault weapon\n  • 9x Chaos Cultist\n    • 9x Autopistol\n      9x Brutal assault weapon',
    ],
    [
      'a faction prefix',
      'World Eaters',
      'Berzerker Warband',
      'Chaos Terminators (170 points)\n  • 1x World Eaters Terminator Champion\n    • 1x Paired accursed weapons\n  • 4x World Eaters Terminator\n    • 4x Combi-bolter\n      4x Power fist',
    ],
    [
      "the unit's last word left off",
      'Adepta Sororitas',
      'Hallowed Martyrs',
      'Paragon Warsuits (180 points)\n  • 1x Paragon Superior\n    • 1x Bolt pistol\n      1x Heavy bolter\n      1x Paragon storm bolters\n      1x Paragon war blade\n  • 2x Paragon\n    • 2x Bolt pistol\n      2x Heavy bolter\n      2x Paragon storm bolters\n      2x Paragon war blade',
    ],
    [
      '"with" for "w/"',
      'Dark Angels',
      'Gauntlet Task Force',
      'Company Heroes (125 points)\n  • 1x Company Champion\n    • 1x Master-crafted Bolt Pistol\n      1x Master-crafted Power Weapon\n  • 1x Company veteran with bolt rifle\n    • 1x Combat Knife\n      1x Master-crafted Bolt Pistol\n      1x Master-crafted Bolt Rifle\n  • 1x Ancient\n    • 1x Combat Knife\n      1x Master-crafted Bolt Pistol\n      1x Master-crafted Bolt Rifle\n  • 1x Company Veteran with heavy bolter\n    • 1x Combat Knife\n      1x Master-crafted Bolt Pistol\n      1x Master-crafted Heavy Bolter',
    ],
    [
      'a stat line',
      'Deathwatch',
      'Black Spear Task Force',
      'Talonstrike Kill Team (265 points)\n  • 1x Kill Team Sergeant with Jump Pack\n    • 1x Plasma pistol\n      1x Power fist\n  • 4x Kill Team Intercessor with Jump Pack\n    • 4x Astartes chainsword\n      2x Heavy bolt pistol\n      2x Plasma pistol\n  • 5x Kill Team Heavy Intercessor with Jump Pack\n    • 5x Assault bolters',
    ],
    [
      'the owner of its wargear',
      'Astra Militarum',
      'Grizzled Company',
      "Gaunt's Ghosts (95 points)\n  • 1x Ibram Gaunt\n    • 1x Bolt Pistol\n      1x Gaunt's chainsword\n  • 1x Colm Corbec\n    • 1x Corbec's hot-shot lascarbine\n      1x Straight silver knife\n  • 1x Elim Rawne\n    • 1x Rawne's lascarbine\n      1x Straight silver knife\n  • 1x Hlaine Larkin\n    • 1x Larkin's long-las\n      1x Straight silver knife\n  • 1x 'Try Again' Bragg\n    • 1x Bragg's autocannon\n      1x Straight silver knife\n  • 1x Oan Mkoll\n    • 1x Lascarbine\n      1x Mkoll's straight silver knife",
    ],
    [
      'its renamed stat line',
      'Drukhari',
      'Spectacle of Spite',
      'Hellions (90 points)\n  • 1x Helliarch\n    • 1x Hellglaive\n      1x Splinter pods\n  • 4x Hellion\n    • 4x Hellglaive\n      4x Splinter pods',
    ],
    [
      'the keyword its upgrade grants',
      'Tyranids',
      'Subterranean Assault',
      'Trygon (155 points)\n  • Subterranean Assault Keywords: Character\n  • 1x Bio-electric pulse\n    1x Trygon scything talons\n  • Enhancement: Trygon Prime',
    ],
    [
      'the keyword its detachment grants',
      'Chaos Knights',
      'Houndpack Lance',
      "War Dog Karnivore (175 points)\n  • Warlord\n  • Houndpack Lance Keyword: Character\n  • 1x Havoc multi-launcher\n    1x Reaper chaintalon\n    1x Slaughterclaw\n  • Enhancement: Preyslayer's Mantle",
    ],
    [
      'its kind without the bracketed loadout',
      'Adeptus Mechanicus',
      'Haloscreed Battle Clade',
      'Sicarian Infiltrators (75 points)\n  • 1x Sicarian Infiltrator Princeps\n    • 1x Flechette blaster\n      1x Taser goad\n  • 4x Sicarian Infiltrator\n    • 4x Flechette blaster\n      4x Taser goad',
    ],
    [
      "its kind without the unit's first words",
      'Space Marines',
      'Gladius Task Force',
      'Terminator Assault Squad (380 points)\n  • 1x Terminator Sergeant\n    • 1x Storm Shield\n      1x Thunder Hammer\n  • 9x Terminator\n    • 5x Storm Shield\n      5x Thunder Hammer\n      4x Twin Lightning Claws',
    ],
    [
      'its loadout',
      'Deathwatch',
      'Black Spear Task Force',
      'Indomitor Kill Team (280 points)\n  • 4x Kill Team Heavy Intercessor with Deathwatch Heavy Bolt Rifle and Ceramite Fists.\n     ◦ 4x Ceramite Fists\n     ◦ 2x Deathwatch Heavy Bolt Rifle\n     ◦ 2x Deathwatch Heavy Bolter\n  • 3x Kill Team Heavy Intercessor with Flamestorm Gauntlets and Twin Power Fists\n     ◦ 3x Auto boltstorm gauntlets\n     ◦ 3x Fragstorm grenade launcher\n     ◦ 3x Twin power fists\n  • 3x Kill Team Heavy Intercessor with Melta Rifle, Bolt Pistol and Ceramite Fists\n     ◦ 3x Bolt Pistol\n     ◦ 3x Ceramite Fists\n     ◦ 3x Melta Rifle',
    ],
  ])('reads an official-app model named by %s', (_shape, faction, detachment, unit) => {
    expect(summary(official(faction, detachment, unit)).mismatches).toEqual([])
  })

  it("reads the official app's close combat weapon as the one melee weapon a datasheet starts with", () => {
    const file = official(
      'Adeptus Custodes',
      'Lions of the Emperor',
      'Prosecutors (55 points)\n  • 1x Prosecutor Sister Superior\n    • 1x Boltgun\n      1x Close combat weapon\n  • 4x Prosecutor\n    • 4x Boltgun\n      4x Close combat weapon',
    )
    expect(summary(file).mismatches).toEqual([])
  })

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

  it("keeps a sergeant's wargear with the sergeant when the list names him differently", () => {
    const file = official(
      'Space Marines',
      'Gladius Task Force',
      'Terminator Assault Squad (380 points)\n  • 1x Terminator Sergeant\n    • 1x Storm Shield\n      1x Thunder Hammer\n  • 9x Terminator\n    • 5x Storm Shield\n      5x Thunder Hammer\n      4x Twin Lightning Claws',
    )
    expect(wargear(file, 'Terminator Assault Squad')).toEqual(['6x storm shield', '6x thunder hammer', '4x twin lightning claws'])
  })

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

  // The datasheet opens its eviscerator models one per five Berzerkers, each taking a Berzerker's place.
  it.each([
    [
      'the official app',
      `Berzerkers (170 Points)

World Eaters
Berzerker Warband (1 Detachment Points)
Purge the Foe
Strike Force (2,000 Points)

OTHER DATASHEETS

Khorne Berzerkers (170 Points)
  • 1x Khorne Berzerker Champion
     ◦ 1x Chainblade
     ◦ 1x Plasma pistol
  • 9x Khorne Berzerker
     ◦ 7x Bolt pistol
     ◦ 7x Chainblade
     ◦ 1x Icon of Khorne
     ◦ 2x Khornate eviscerator
     ◦ 2x Plasma pistol

Exported with App Version: v2.8.1 (1), Data Version: v995`,
    ],
    [
      'New Recruit',
      `+++++++++++++++++++++++++++++++++++++++++++++++
+ FACTION KEYWORD: Chaos - World Eaters
+ DETACHMENT: Berzerker Warband
+ TOTAL ARMY POINTS: 170pts
+++++++++++++++++++++++++++++++++++++++++++++++

10x Khorne Berzerkers (170 pts)
• 9x Khorne Berzerker
    7 with Bolt pistol, Chainblade
    1 with Khornate eviscerator, Plasma pistol
    1 with Icon of Khorne, Khornate eviscerator, Plasma pistol
• 1x Khorne Berzerker Champion: Chainblade, Plasma pistol

Created with newrecruit.eu v36.47`,
    ],
  ])('fields Khorne Berzerkers with eviscerators and plasma pistols from %s', (_source, file) => {
    const { definitions } = catalogue.index
    const unit = imported(file).units[0]!
    const fielded = Object.values(unit.spreads).flatMap((spread) =>
      Object.entries(spread).flatMap(([id, count]) => (count > 0 ? [`${count}x ${nameOf(definitions.get(id)!, definitions)}`] : [])),
    )
    expect(fielded).toEqual(['2x Khorne Berzerker w/ eviscerator and plasma pistol'])
  })

  const officialApp = (faction: string, unit: string) => `Imported (2,000 Points)

${faction}
Strike Force (2,000 Points)

OTHER DATASHEETS

${unit}

Exported with App Version: v2.8.1 (1), Data Version: v995`

  // Lists that placed at tournaments, each placing wargear where the catalogue nests or shares it.
  it.each([
    [
      'storm bolter and hunter-killer missile in one uncapped group',
      'Adepta Sororitas',
      'Castigator',
      `Castigator (165 points)
  • 1x Armoured tracks
    1x Castigator autocannons
    3x Heavy bolter
    1x Hunter-killer missile
    1x Storm bolter`,
      ['1x hunter-killer missile', '1x storm bolter'],
    ],
    [
      'Wraiths named after their datasheet',
      'Necrons',
      'Canoptek Wraiths',
      `Canoptek Wraiths (95 points)
  • 3x Canoptek Wraith
    • 3x Particle caster
      3x Vicious claws`,
      ['3x particle caster'],
    ],
    [
      'the reported Chaos Terminators, whose heavy weapons only some models carry',
      'Chaos Space Marines',
      'Chaos Terminator Squad',
      `Chaos Terminator Squad (370 Points)
  • 1x Terminator Champion
     ◦ 1x Chainfist
     ◦ 1x Combi-bolter
  • 9x Chaos Terminator
     ◦ 2x Accursed weapon
     ◦ 1x Chainfist
     ◦ 7x Combi-bolter
     ◦ 6x Power fist
     ◦ 2x Reaper autocannon`,
      ['2x reaper autocannon', '6x power fist', '2x accursed weapon'],
    ],
    [
      'a unit-wide icon printed under the Champion',
      'Chaos Space Marines',
      'Chaos Bikers',
      `Chaos Bikers (70 Points)
  • 1x Biker Champion
     ◦ 1x Chaos Icon
     ◦ 1x Close combat weapon
     ◦ 1x Combi-bolter
     ◦ 1x Power fist
  • 2x Chaos Biker
     ◦ 2x Astartes chainsword
     ◦ 2x Close combat weapon
     ◦ 2x Combi-bolter
     ◦ 2x Plasma gun`,
      ['1x chaos icon', '2x plasma gun', '2x astartes chainsword'],
    ],
    [
      'the reported Allarus Custodians with a Vexilla',
      'Adeptus Custodes',
      'Allarus Custodians',
      `Allarus Custodians (195 Points)
  • 3x Allarus Custodians
     • 3x Balistus Grenade Launcher
     • 3x Castellan Axe
     • 1x Vexilla`,
      ['1x vexilla', '3x castellan axe'],
    ],
    [
      'heavy weapon Terminators, each with a melee weapon',
      'Space Marines',
      'Deathwatch Terminator Squad',
      `Deathwatch Terminator Squad (200 points)
  • 1x Deathwatch Terminator Sergeant
    • 1x Storm Shield
      1x Thunder Hammer
  • 4x Deathwatch Terminator
    • 3x Chainfist
      3x Plasma Cannon
      1x Storm Shield
      1x Thunder Hammer`,
      ['3x chainfist', '3x plasma cannon'],
    ],
    [
      'Neophytes whose second pair of heavy weapons needs twenty models',
      'Genestealer Cults',
      'Neophyte Hybrids',
      `Neophyte Hybrids (135 Points)
  • 1x Neophyte Leader
     ◦ 1x Anointed pistol
     ◦ 1x Autopistol
     ◦ 1x Power weapon
  • 19x Neophyte Hybrid
     ◦ 19x Autopistol
     ◦ 19x Close combat weapon
     ◦ 1x Cult Icon
     ◦ 2x Grenade launcher
     ◦ 11x Hybrid firearm
     ◦ 2x Mining laser
     ◦ 2x Seismic cannon
     ◦ 2x Webber`,
      ['2x mining laser', '2x seismic cannon', '2x webber', '11x hybrid firearm'],
    ],
    [
      'a Talos whose arms both offer the macro-scalpel',
      'Drukhari',
      'Talos',
      `Talos (150 Points)
  • 2x Talos
     ◦ 2x Macro-scalpel
     ◦ 2x Twin heat lance
     ◦ 2x Twin liquifier gun`,
      ['2x twin liquifier gun', '2x macro-scalpel'],
    ],
    [
      'a Rhino with its own combi-bolter beside the optional one',
      'Death Guard',
      'Chaos Rhino',
      `Chaos Rhino (75 points)
  • 1x Armoured tracks
    2x Combi-bolter
    1x Havoc launcher`,
      ['2x combi-bolter', '1x havoc launcher'],
    ],
    [
      'cyclone Terminators, not counted by the thunder hammer they could take instead',
      'Space Marines',
      'Deathwatch Terminator Squad',
      `Deathwatch Terminator Squad (190 points)
  • 1x Deathwatch Terminator Sergeant
    • 1x Storm Shield
      1x Thunder hammer
  • 4x Deathwatch Terminator
    • 3x Cyclone missile launcher
      3x Power fist
      1x Storm Shield
      3x Storm bolter
      1x Thunder hammer`,
      ['3x cyclone missile launcher'],
    ],
    [
      'a squad grenade launcher printed under the Sergeant',
      'Space Marines',
      'Intercessor Squad',
      `Intercessor Squad (80 points)
  • 1x Intercessor Sergeant
    • 1x Astartes grenade launcher
      1x Bolt pistol
      1x Bolt rifle
      1x Power fist
  • 4x Intercessor
    • 4x Bolt pistol
      4x Bolt rifle
      4x Close combat weapon`,
      ['1x grenade launcher', '1x power fist'],
    ],
  ])('places %s', (_case, faction, unit, text, pieces) => {
    const held = wargear(officialApp(faction, text), unit)
    for (const piece of pieces) expect(held).toContain(piece)
  })

  it("arms a Techmarine with the catalogue's one axe-and-servo-arm piece", () => {
    const file = officialApp(
      'Space Marines',
      `Techmarine (55 Points)
  • 1x Forge bolter
  • 1x Grav-pistol
  • 1x Omnissian power axe
  • 1x Servo-arm`,
    )
    expect(imported(file).unplaced).toEqual([])
  })

  it('reads Traitor Guardsmen by the kind their group fields', () => {
    const file = officialApp(
      'Chaos Space Marines',
      `Traitor Guardsmen Squad (65 points)
  • 1x Traitor Sergeant
    • 1x Boltgun
      1x Power weapon
  • 9x Traitor Guardsmen
    • 9x Close combat weapon
      1x Cultist grenade launcher
      6x Lasgun
      1x Meltagun
      1x Plasma gun`,
    )
    expect(imported(file).unplaced).toEqual([])
  })

  it('reads a Grey Knights Ancient as the model carrying the banner', () => {
    const file = officialApp(
      'Grey Knights',
      `Brotherhood Terminator Squad (140 Points)
  • 1x Justicar
     ◦ 1x Nemesis force weapon
     ◦ 1x Storm bolter
  • 2x Terminator
     ◦ 1x Apothecary's Narthecium
     ◦ 2x Nemesis force weapon
     ◦ 1x Storm bolter
  • 1x Ancient
     ◦ 1x Ancient's Banner
     ◦ 1x Nemesis force weapon
     ◦ 1x Storm bolter

Paladin Squad (215 Points)
  • 1x Paragon
     ◦ 1x Nemesis force weapon
     ◦ 1x Storm bolter
  • 1x Paladin Ancient
     ◦ 1x Ancient's Banner
     ◦ 1x Incinerator
     ◦ 1x Nemesis force weapon
  • 3x Paladin
     ◦ 1x Apothecary's Narthecium
     ◦ 2x Incinerator
     ◦ 3x Nemesis force weapon`,
    )
    expect(imported(file).unplaced).toEqual([])
  })

  const newRecruit = (faction: string, units: string) => `+++++++++++++++++++++++++++++++++++++++++++++++
+ FACTION KEYWORD: ${faction}
+ TOTAL ARMY POINTS: 2000pts
+++++++++++++++++++++++++++++++++++++++++++++++

${units}

Created with newrecruit.eu v36.47`

  it('gives a Plague Champion the plasma gun his squad has no body left for', () => {
    const file = newRecruit(
      'Chaos - Death Guard',
      `5x Plague Marines (90 pts)
• 4x Plague Marine
    1 with Plague knives, Plague spewer
    1 with Blight launcher, Plague knives
    1 with Heavy plague weapon, Plague knives
    1 with Plague knives, Plasma gun
• 1x Plague Champion: Plasma gun, Plague knives`,
    )
    expect(wargear(file, 'Plague Marines')).toEqual(expect.arrayContaining(['1x heavy plague weapon', '2x plasma gun']))
  })

  it('places the reported Crisis Battlesuit drones New Recruit lists by model', () => {
    const file = newRecruit(
      "Xenos - T'au Empire",
      `3x Crisis Fireknife Battlesuits (130 pts)
• 2x Crisis Fireknife Shas'ui
    1 with Gun Drone, Shield Drone, Battlesuit fists, 2x Missile pod
    1 with Marker Drone, Shield Drone, Battlesuit fists, 2x Missile pod
• 1x Crisis Fireknife Shas'vre: Gun Drone, Shield Drone, 2x Missile pod, Battlesuit fists

3x Crisis Starscythe Battlesuits (130 pts)
• 2x Crisis Starscythe Shas'ui
    2 with Gun Drone, Shield Drone, 2x Burst cannon, Battlesuit fists
• 1x Crisis Starscythe Shas'vre: Gun Drone, Marker Drone, 2x Burst cannon, Battlesuit fists`,
    )
    expect(imported(file).unplaced).toEqual([])
  })

  it('fields every drone a Crisis squad lists without saying who carries it', () => {
    const file = newRecruit(
      "Xenos - T'au Empire",
      `3x Crisis Starscythe Battlesuits (130 pts)
• 2x Crisis Starscythe Shas'ui
    2 with Gun Drone, Shield Drone, 2x Burst cannon, Battlesuit fists
• 1x Crisis Starscythe Shas'vre: Gun Drone, Marker Drone, 2x Burst cannon, Battlesuit fists`,
    )
    expect(wargear(file, 'Crisis Starscythe Battlesuits')).toEqual(
      expect.arrayContaining(['3x twin pulse carbine', '2x shield drone', '1x marker drone']),
    )
  })

  it('gives each Harlequin Player only their own weapons', () => {
    const file = newRecruit(
      'Xenos - Aeldari',
      `5x Troupe (85 pts)
• 1x Lead Player: Power sword, Fusion Pistol
• 1x Player with Harlequin's Special Weapon: Harlequin's Special Weapon, Shuriken Pistol
• 2x Player with Neuro Disruptor: 2 with Neuro Disruptor, Harlequin's Special Weapon
• 1x Player with Fusion Pistol: Fusion Pistol, Harlequin's Special Weapon`,
    )
    expect(wargear(file, 'Troupe')).toContain('2x neuro disruptor')
  })

  it('arms Harlequin Players the official app lists together', () => {
    const file = officialApp(
      'Aeldari',
      `Troupe (85 Points)
  • 1x Lead Player
     ◦ 1x Flip Belt
     ◦ 1x Fusion pistol
     ◦ 1x Power sword
  • 4x Player
     ◦ 4x Flip Belt
     ◦ 1x Fusion pistol
     ◦ 4x Harlequin's special weapon
     ◦ 2x Neuro disruptor
     ◦ 1x Shuriken pistol`,
    )
    expect(wargear(file, 'Troupe')).toContain('2x neuro disruptor')
  })

  it('keeps the Servitors whose multi-meltas fill an Inquisitorial Agents squad', () => {
    const file = newRecruit(
      'Imperium - Agents of the Imperium',
      `12x Inquisitorial Agents (100 pts):
 2x Tome-skull
• 10x Agent
    4 with Agent firearm, Agent melee weapon
    2 with Agent firearm, Agent melee weapon, Eviscerator
    2 with Agent firearm, Agent melee weapon, Mystic stave
    2 with Agent firearm, Agent melee weapon, Plasma pistol
• 2x Servitor: 2 with Agent melee weapon, Multi-melta`,
    )
    expect(wargear(file, 'Inquisitorial Agents')).toContain('2x multi-melta')
  })

  // 40k.app prints a squad's loadouts on one line, leaving the heavy weapon Terminators' fists to their default.
  it('keeps the default fists of heavy weapon Terminators a 40k.app line does not name', () => {
    const file = `Terminators
Ultramarines · Deathwatch Support
2000/2000 pts

Ultramarines [200 pts]

OTHER DATASHEETS [200 pts]
  Deathwatch Terminator Squad [200 pts] (5 models)
    Power Fist + Storm Bolter / Storm Shield + Thunder Hammer / 3× Plasma Cannon

Exported from 40k.app, view the full list here:`
    expect(wargear(file, 'Deathwatch Terminator Squad')).toContain('3x power fist')
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

  it('matches a squad that older official-app data names by its models', () => {
    expect(summary(custodesOfficial.replaceAll('Witchseeker Squad (', 'Witchseekers ('))).toMatchObject({
      units: '10 of 10',
      mismatches: [],
    })
  })

  it.each([
    ['the reported Custodes', custodesFortyKApp, 'Imperium - Adeptus Custodes', 2, '4 of 4', 1, '980 for 980'],
    ['Space Wolves with allies', spaceWolvesFortyKApp, 'Imperium - Adeptus Astartes - Space Wolves', 3, '12 of 12', 2, '2565 for 2565'],
    ['grouped Space Wolves', spaceWolvesFortyKAppGrouped, 'Imperium - Adeptus Astartes - Space Wolves', 3, '12 of 12', 2, '2565 for 2565'],
    ['Agents of the Imperium', agentsFortyKApp, 'Imperium - Agents of the Imperium', 1, '11 of 11', 2, '3155 for 3155'],
    [
      'Space Marines as Markdown',
      spaceMarinesFortyKAppMarkdown,
      'Imperium - Adeptus Astartes - Space Marines',
      1,
      '10 of 10',
      0,
      '3020 for 3020',
    ],
  ])('imports 40k.app text of %s without mismatches', (_, file, faction, detachments, units, attached, points) => {
    expect(summary(file)).toEqual({ format: '40k-app', faction, detachments, units, attached, mismatches: [], points })
  })

  it("keeps a 40k.app unit's note as its private note", () => {
    expect(imported(spaceMarinesFortyKAppMarkdown).units.flatMap((unit) => unit.note ?? [])).toEqual(['Move block, then charge'])
  })

  // Units from lists built on 40k.app on 1 November 2026, each naming a piece the catalogue spells, combines or files differently.
  const fortyKAppUnit = (army: string, unit: string) => `Units\n${army}\nMission: Purge the Foe\n0/2000 pts\n\nUNITS [0 pts]\n${unit}`
  it.each([
    [
      'combined loadouts',
      'Adeptus Mechanicus · Cohort Acquisitus',
      'Kataphron Breachers [290 pts] (6 models)\n  6× Heavy arc rifle / 6× Hydraulic claw',
    ],
    [
      'one model with two heavy weapons',
      'Asuryani · Windrider Host',
      'War Walkers A [80 pts]\n  War Walker feet / Scatter laser / Shuriken cannon\nWar Walkers B [80 pts]\n  War Walker feet / 2× Scatter laser',
    ],
    [
      'a weapon the model itself holds',
      'Asuryani · Windrider Host',
      'Hemlock Wraithfighter [155 pts]\n  2× Heavy D-scythe + Wraithbone hull',
    ],
    [
      'an ability listed as wargear',
      'Dark Angels · Wrath of the Rock',
      "Azrael [150 pts]\n  Lion's Wrath + The Lion Helm + The Sword of Secrets",
    ],
    ['hyphens', 'Imperial Fists · Gravis Linebreaker Force', 'Tor Garadon [90 pts]\n  Artificer Grav-gun + Hand of Defiance'],
    [
      '"and" for "&"',
      'Adeptus Mechanicus · Cohort Acquisitus',
      'Serberys Raiders [75 pts] (3 models)\n  Cavalry sabre and clawed limbs + Mechanicus pistol + Galvanic carbine / 2× Galvanic carbine + Cavalry sabre and clawed limbs',
    ],
    [
      'weapons an option prints',
      'Necrons · Annihilation Legion',
      'Triarch Praetorians [160 pts] (10 models)\n  10× Particle caster + Voidblade',
    ],
    [
      'a weapon without its unit in its name',
      'Adeptus Astartes · Gauntlet Task Force',
      'Gladiator Lancer [160 pts]\n  Armoured Hull + Defensive Array + Laser Destroyer',
    ],
    [
      'a datasheet named after its faction',
      'World Eaters · Berzerker Warband',
      'Chaos Warhound Titan [1100 pts]\n  Warhound feet / 2× Warhound vulcan mega-bolter',
    ],
    [
      'an enhancement the field manual spells differently',
      'Genestealer Cults · Biosanctic Broodsurge',
      'Patriarch [105 pts]\n  Enhancement: Biomorph Adaptation (+25 pts)\n  Patriarch’s claws',
    ],
    [
      'an enhancement the catalogue spells "TL-409"',
      'Adeptus Mechanicus · Lords of the Forge',
      'Technoarcheologist [75 pts]\n  Enhancement: TL-4ø9 (+30 pts)\n  Mechanicus pistol + Servo-arc claw',
    ],
    [
      'an enhancement the catalogue calls "Sublime Presence"',
      'Emperor’s Children · Rapid Evisceration',
      'Lord Exultant [120 pts]\n  Enhancement: Sublime Prescience (+25 pts)\n  Master-crafted power sword / Plasma pistol / Bolt Pistol + Close combat weapon',
    ],
    ['default gear only its datacard names', 'Asuryani · Windrider Host', 'Solitaire [105 pts]\n  Flip Belt + Solitaire weapons'],
    [
      'a qualifier in brackets',
      'Orks · War Horde',
      'Tankbustas [160 pts] (6 models)\n  Rokkit Pistol + Smash Hammer / 5× Gitstikka + Busta Rokkit Launcha / Choppa / Pulsa Rokkit (Once per battle, per unit)',
    ],
    [
      'a retinue it prints no count for',
      'Adepta Sororitas · Sacred Champions',
      'Canis Rex [415 pts]\n  Questoris multi-laser + Freedom’s Hand + Las-impulsor',
    ],
  ])('places 40k.app wargear given %s', (_, army, unit) => {
    expect(summary(fortyKAppUnit(army, unit)).mismatches).toEqual([])
  })

  it('reads a 40k.app detachment spelled with a space', () => {
    const file = fortyKAppUnit(
      'Adeptus Mechanicus · Haloscreed Battle Clade',
      'Kataphron Breachers [290 pts] (6 models)\n  6× Heavy arc rifle / 6× Hydraulic claw',
    )
    expect(summary(file)).toMatchObject({ detachments: 1, mismatches: [] })
  })

  it('keeps a note 40k.app prints where hidden default gear would be', () => {
    const file = fortyKAppUnit(
      'Adeptus Mechanicus · Lords of the Forge',
      'Technoarcheologist [75 pts]\n  Enhancement: TL-4ø9 (+30 pts)\n  Kill priority: anything with a lascannon',
    )
    expect(imported(file)).toMatchObject({ unplaced: [], units: [{ note: 'Kill priority: anything with a lascannon' }] })
  })

  it('reads a 40k.app unit without a model count as one model', () => {
    const file = fortyKAppUnit('Asuryani · Windrider Host', 'War Walkers [80 pts]\n  War Walker feet / 2× Scatter laser')
    expect(imported(file).units.map((unit) => unit.models)).toEqual([1])
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

  it('keeps the known detachment joined by "and" to one the catalogue does not offer', () => {
    const result = imported(salamandersOfficial.replace('Deathwatch Support and', 'Unknown Conclave and'))
    expect([result.detachmentIds, result.unknown.map((unknown) => unknown.name)]).toEqual([['e073-8fe8-5b59-48f0'], ['Unknown Conclave']])
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
