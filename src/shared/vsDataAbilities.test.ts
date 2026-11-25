import { expect, it } from 'vitest'
import type { VsDataUnits } from './vsData'
import { abilitySummaryIn, datasheetAbilitySummary } from './vsDataAbilities'

const summary = { blocks: [], questions: [] }
const units: VsDataUnits = { units: {}, aliases: {}, abilities: { 'orks.tankbustas.bomb-squigs': summary } }

it('finds an ability whose name a datasheet prints in the singular and VS Data in the plural', () =>
  expect(abilitySummaryIn(units, '@orks.tankbustas', 'Bomb Squig (1 per unit)')).toBe(summary))

it('finds the army rule a datasheet with no VS Data unit prints by the one faction that has it', () =>
  expect(abilitySummaryIn({ units: {}, aliases: {}, abilities: { 'orks.waaagh': summary } }, 'crucible-entry', 'Waaagh!')).toBe(summary))

it('finds a card of a detachment another faction’s page shows by the one owner of that detachment', () =>
  expect(
    abilitySummaryIn(
      { units: {}, aliases: {}, abilities: { 'space-marines.stormlance-task-force.feinting-withdrawal': summary } },
      '@dark-angels.stormlance-task-force',
      'Feinting Withdrawal',
    ),
  ).toBe(summary))

it('finds a record VS Data shares between units for each unit it names, and for no other', () => {
  const sharing: VsDataUnits = {
    units: {
      raider: { id: 'space-marines.land-raider', sizes: [], models: [], options: [], shared: ['shared.land-raider.damaged'] },
      crusader: { id: 'space-marines.land-raider-crusader', sizes: [], models: [], options: [], shared: ['shared.land-raider.damaged'] },
      rhino: { id: 'space-marines.rhino', sizes: [], models: [], options: [] },
    },
    aliases: {},
    abilities: { 'shared.land-raider.damaged': summary },
  }
  expect(['raider', 'crusader', 'rhino'].map((entry) => abilitySummaryIn(sharing, entry, 'Damaged: 1-5 Wounds Remaining'))).toEqual([
    summary,
    summary,
    null,
  ])
})

const said = (text: string) => ({ blocks: [{ paragraph: [{ text }] }], questions: [] })
const packLeader = said('Pack Leader')
const warptime = said('Warptime')
const daemons = (abilities: VsDataUnits['abilities']): VsDataUnits => ({
  units: {
    karanak: { id: 'chaos-daemons.karanak', sizes: [], models: [], options: [] },
    sorcerer: { id: 'chaos-space-marines.sorcerer-in-terminator-armour', sizes: [], models: [], options: [] },
    flamers: { id: 'chaos-daemons.flamers', sizes: [], models: [], options: [] },
    exalted: { id: 'chaos-daemons.exalted-flamer', sizes: [], models: [], options: [] },
  },
  aliases: {},
  abilities,
})
// Game Datacards prints Karanak's Pack Leader in the words of a Sorcerer's Warptime, so the printed text names that record.
const printedWarptime = { id: 'ability:chaos-space-marines.sorcerer-in-terminator-armour.warptime', summary: warptime }

it('reads a datasheet ability from its own unit’s record before the record its printed text names', () =>
  expect(
    datasheetAbilitySummary(
      daemons({ 'chaos-daemons.karanak.pack-leader': packLeader, 'chaos-space-marines.sorcerer-in-terminator-armour.warptime': warptime }),
      'karanak',
      'Pack Leader',
      undefined,
      printedWarptime,
    ),
  ).toBe(packLeader))

it('reads no other unit’s ability of another name that its printed text names', () =>
  expect(
    datasheetAbilitySummary(
      daemons({ 'chaos-space-marines.sorcerer-in-terminator-armour.warptime': warptime }),
      'karanak',
      'Pack Leader',
      undefined,
      printedWarptime,
    ),
  ).toBeNull())

it('reads another unit’s ability of the same name that its printed text names', () => {
  const fire = said('Fire of Tzeentch')
  expect(
    datasheetAbilitySummary(daemons({}), 'flamers', 'Fire of Tzeentch', undefined, {
      id: 'ability:chaos-daemons.exalted-flamer.fire-of-tzeentch',
      summary: fire,
    }),
  ).toBe(fire)
})

it('reads its own unit’s record its printed text names before a core ability of that name', () => {
  const own = said('Flamers support')
  expect(
    datasheetAbilitySummary(daemons({ 'core.support': said('Support') }), 'flamers', 'Support', undefined, {
      id: 'ability:chaos-daemons.flamers.support',
      summary: own,
    }),
  ).toBe(own)
})

it('reads a faction chip under the faction-level alias VS Data gives a detachment’s rule for the unit’s own faction', () => {
  const warpRifts = said('Warp Rifts')
  const titans: VsDataUnits = {
    units: { warlord: { id: 'chaos-titan-legions.chaos-warlord-titan', sizes: [], models: [], options: [] } },
    aliases: {},
    // VS Data's alias `chaos-titan-legions.warp-rifts` is indexed as an ability id beside the record's own; another
    // faction's rule of the name leaves the one-faction fallback no answer, so the unit's own faction must reach it.
    abilities: {
      'chaos-daemons.daemonic-incursion.warp-rifts': warpRifts,
      'chaos-titan-legions.warp-rifts': warpRifts,
      'chaos-daemons.warp-rifts': said('Daemonic Warp Rifts'),
    },
  }
  expect([
    abilitySummaryIn(titans, 'warlord', 'Warp Rifts'),
    datasheetAbilitySummary(titans, 'warlord', 'Warp Rifts', undefined, null),
  ]).toEqual([warpRifts, warpRifts])
})

it('reads no detachment’s rule of another name that a unit’s printed text names', () => {
  const firstPrince = said('First Prince of Chaos')
  const furies: VsDataUnits = {
    units: { furies: { id: 'chaos-daemons.furies', sizes: [], models: [], options: [] } },
    aliases: {},
    abilities: { 'chaos-daemons.shadow-legion.first-prince-of-chaos': firstPrince },
  }
  expect(
    datasheetAbilitySummary(furies, 'furies', 'Gloam Rot', undefined, {
      id: 'ability:chaos-daemons.shadow-legion.first-prince-of-chaos',
      summary: firstPrince,
    }),
  ).toBeNull()
})

it('reads no weapon ability its printed text names for another qualifier than the chip’s', () => {
  const infantry = said('Devastating Wounds against Infantry')
  expect(
    datasheetAbilitySummary(daemons({}), 'flamers', 'DEVASTATING WOUNDS: MONSTER/VEHICLE', undefined, {
      id: 'weapon-ability:devastating-wounds-infantry',
      summary: infantry,
    }),
  ).toBeNull()
})

it('reads no other unit’s ability of another name that VS Data aliases a profile to', () => {
  const voltagheist = said('Voltagheist Field')
  const marines: VsDataUnits = {
    units: { assault: { id: 'space-marines.assault-squad-with-jump-packs', sizes: [], models: [], options: [] } },
    aliases: { 'hammer-of-wrath-profile': 'chaos-space-marines.negavolt-cultists.voltagheist-field' },
    abilities: { 'chaos-space-marines.negavolt-cultists.voltagheist-field': voltagheist },
  }
  expect(datasheetAbilitySummary(marines, 'assault', 'Hammer of Wrath', 'hammer-of-wrath-profile', null)).toBeNull()
})

it('reads another unit’s ability VS Data aliases a profile to whose name the datasheet misspells', () => {
  const conduit = said('Desiccation Conduit')
  const deathGuard: VsDataUnits = {
    units: { lord: { id: 'death-guard.chaos-lord-in-terminator-armour', sizes: [], models: [], options: [] } },
    aliases: { 'conduit-profile': 'death-guard.death-guard-chaos-lord.desiccation-conduit-aura' },
    abilities: { 'death-guard.death-guard-chaos-lord.desiccation-conduit-aura': conduit },
  }
  expect(datasheetAbilitySummary(deathGuard, 'lord', 'Dessication Conduit (Aura)', 'conduit-profile', null)).toBe(conduit)
})

it('reads its own unit’s record of another name that VS Data aliases its profile to', () => {
  const transport = said('Banehammer transport')
  const banehammer: VsDataUnits = {
    units: { banehammer: { id: 'astra-militarum.banehammer', sizes: [], models: [], options: [] } },
    aliases: { 'banehammer-profile': 'astra-militarum.banehammer.transport' },
    abilities: { 'astra-militarum.banehammer.transport': transport },
  }
  expect(datasheetAbilitySummary(banehammer, 'banehammer', 'Banehammer', 'banehammer-profile', null)).toBe(transport)
})

it('reads no other faction’s rule of another name that VS Data aliases a profile to', () => {
  const marines: VsDataUnits = {
    units: { assault: { id: 'space-marines.assault-squad-with-jump-packs', sizes: [], models: [], options: [] } },
    aliases: { 'hammer-of-wrath-profile': 'chaos-space-marines.dark-pacts' },
    abilities: { 'chaos-space-marines.dark-pacts': said('Dark Pacts') },
  }
  expect(datasheetAbilitySummary(marines, 'assault', 'Hammer of Wrath', 'hammer-of-wrath-profile', null)).toBeNull()
})

it('reads the record of its own detachment its printed text names under another name, whatever catalogue owns the detachment', () => {
  const champion = said('Venerable Champion')
  expect(
    datasheetAbilitySummary(daemons({}), '@marines-codex.ironclad-champions', 'Venerable Champion (Aura)', undefined, {
      id: 'ability:space-marines.ironclad-champions.venerable-champion-aura-upgrade',
      summary: champion,
    }),
  ).toBe(champion)
})

it('reads its owner’s record of a name the catalogue misspells', () => {
  const camouflage = said('Naturalised Camouflage')
  expect(
    abilitySummaryIn(
      { units: {}, aliases: {}, abilities: { 'tyranids.unending-swarm.naturalised-camouflage': camouflage } },
      '@tyranids-catalogue.unending-swarm',
      'Naturalised Camoflage',
    ),
  ).toBe(camouflage)
})

it('reads no record of its owner a short name differs from by a word', () =>
  expect(
    abilitySummaryIn(
      {
        units: { belakor: { id: 'chaos-daemons.belakor', sizes: [], models: [], options: [] } },
        aliases: {},
        abilities: { 'chaos-daemons.belakor.shadow-lord-aura-psychic': said('Shadow Lord') },
      },
      'belakor',
      'Shadow Form',
    ),
  ).toBeNull())
