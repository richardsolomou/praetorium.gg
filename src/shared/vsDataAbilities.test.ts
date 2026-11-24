import { expect, it } from 'vitest'
import type { VsDataUnits } from './vsData'
import { abilitySummaryIn } from './vsDataAbilities'

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
  const units: VsDataUnits = {
    units: {
      raider: { id: 'space-marines.land-raider', sizes: [], models: [], options: [], shared: ['shared.land-raider.damaged'] },
      crusader: { id: 'space-marines.land-raider-crusader', sizes: [], models: [], options: [], shared: ['shared.land-raider.damaged'] },
      rhino: { id: 'space-marines.rhino', sizes: [], models: [], options: [] },
    },
    aliases: {},
    abilities: { 'shared.land-raider.damaged': summary },
  }
  expect(['raider', 'crusader', 'rhino'].map((entry) => abilitySummaryIn(units, entry, 'Damaged: 1-5 Wounds Remaining'))).toEqual([
    summary,
    summary,
    null,
  ])
})
