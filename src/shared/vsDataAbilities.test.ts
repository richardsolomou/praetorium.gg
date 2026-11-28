import { expect, it } from 'vitest'
import type { VsDataUnits } from './vsData'
import { abilitySummaryIn, datasheetAbilitySummary, unitsInBook } from './vsDataAbilities'

const said = (text: string) => ({ blocks: [{ paragraph: [{ text }] }], questions: [] })
const grinder = said('Soul Grinder Scuttling Walker')
const onager = said('Onager Scuttling Walker')
const warptime = said('Warptime')
const units: VsDataUnits = {
  units: {
    'grinder-entry': { id: 'chaos-daemons.soul-grinder', sizes: [], models: [], options: [] },
    'karanak-entry': { id: 'chaos-daemons.karanak', sizes: [], models: [], options: [] },
  },
  aliases: {
    'walker-profile': 'adeptus-mechanicus.onager-dunecrawler.scuttling-walker',
    'grinder-entry/walker-profile': 'chaos-daemons.soul-grinder.scuttling-walker',
  },
  abilities: {
    'adeptus-mechanicus.onager-dunecrawler.scuttling-walker': onager,
    'chaos-daemons.soul-grinder.scuttling-walker': grinder,
    'chaos-daemons.soul-grinder.transport': said('Transport'),
    'chaos-space-marines.sorcerer-in-terminator-armour.warptime': warptime,
    'chaos-daemons.shadow-of-chaos': said('Shadow of Chaos'),
  },
}
// Game Datacards prints Karanak's Pack Leader in the words of a Sorcerer's Warptime, so the printed text names that record.
const printedWarptime = [{ id: 'ability:chaos-space-marines.sorcerer-in-terminator-armour.warptime', summary: warptime }]

it('reads a datasheet ability as the record VS Data aliases its BSData profile to', () =>
  expect(datasheetAbilitySummary(units, 'onager-entry', 'walker-profile', [])).toBe(onager))

it('reads a profile several datasheets share as the record its own datasheet has', () =>
  expect(datasheetAbilitySummary(units, 'grinder-entry', 'walker-profile', [])).toBe(grinder))

it('reads no other unit’s record its printed text names', () =>
  expect(datasheetAbilitySummary(units, 'karanak-entry', 'pack-leader-profile', printedWarptime)).toBeNull())

it('reads the faction rule its printed text names', () =>
  expect(
    datasheetAbilitySummary(units, 'karanak-entry', 'shadow-profile', [
      { id: 'ability:chaos-daemons.shadow-of-chaos', summary: units.abilities['chaos-daemons.shadow-of-chaos']! },
    ]),
  ).toBe(units.abilities['chaos-daemons.shadow-of-chaos']))

it('reads its own detachment’s rule its printed text names, whatever catalogue’s page shows the detachment', () =>
  expect(
    datasheetAbilitySummary(
      { ...units, abilities: { 'space-marines.stormlance-task-force.feinting-withdrawal': warptime } },
      '@dark-angels.stormlance-task-force',
      undefined,
      [{ id: 'ability:space-marines.stormlance-task-force.feinting-withdrawal', summary: warptime }],
    ),
  ).toBe(warptime))

it('reads words several units print alike as its own unit’s record', () =>
  expect(
    datasheetAbilitySummary(units, 'grinder-entry', undefined, [
      { id: 'ability:adeptus-mechanicus.onager-dunecrawler.scuttling-walker', summary: onager },
      { id: 'ability:chaos-daemons.soul-grinder.scuttling-walker', summary: grinder },
    ]),
  ).toBe(grinder))

it('reads an ability VS Data shares with its unit that its printed text names', () =>
  expect(
    datasheetAbilitySummary(
      {
        ...units,
        units: {
          'raider-entry': { id: 'space-marines.land-raider', sizes: [], models: [], options: [], shared: ['shared.land-raider.damaged'] },
        },
      },
      'raider-entry',
      undefined,
      [{ id: 'ability:shared.land-raider.damaged', summary: warptime }],
    ),
  ).toBe(warptime))

it('finds a unit’s own record of a name, as its Transport', () =>
  expect(abilitySummaryIn(units, 'grinder-entry', 'Transport')).toBe(units.abilities['chaos-daemons.soul-grinder.transport']))

it('reads a datasheet as the unit its book’s own key names, as a chaos book’s Titan', () =>
  expect(
    unitsInBook(
      {
        ...units,
        units: {
          titan: { id: 'titan-legions.warlord-titan', sizes: [], models: [], options: [] },
          'chaos-book/titan': { id: 'chaos-titan-legions.chaos-warlord-titan', sizes: [], models: [], options: [] },
        },
      },
      'legacy-rosters~chaos-book',
    ).units.titan?.id,
  ).toBe('chaos-titan-legions.chaos-warlord-titan'))

it('reads its own faction’s rule of the exact name a datasheet prints, as an army rule’s chip', () =>
  expect(datasheetAbilitySummary(units, 'karanak-entry', undefined, [], 'Shadow of Chaos')).toBe(
    units.abilities['chaos-daemons.shadow-of-chaos'],
  ))
