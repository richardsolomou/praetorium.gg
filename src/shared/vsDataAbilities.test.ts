import { expect, it } from 'vitest'
import type { VsDataUnits } from './vsData'
import { abilitySummaryIn } from './vsDataAbilities'

const summary = { blocks: [], questions: [] }
const units: VsDataUnits = { units: {}, aliases: {}, abilities: { 'orks.tankbustas.bomb-squigs': summary } }

it('finds an ability whose name a datasheet prints in the singular and VS Data in the plural', () =>
  expect(abilitySummaryIn(units, '@orks.tankbustas', 'Bomb Squig (1 per unit)')).toBe(summary))

it('finds the army rule a datasheet with no VS Data unit prints by the one faction that has it', () =>
  expect(abilitySummaryIn({ units: {}, aliases: {}, abilities: { 'orks.waaagh': summary } }, 'crucible-entry', 'Waaagh!')).toBe(summary))
