import { expect, it } from 'vitest'
import type { VsDataUnits } from './vsData'
import { abilitySummaryIn } from './vsDataAbilities'

const summary = { blocks: [], questions: [] }
const units: VsDataUnits = { units: {}, aliases: {}, abilities: { 'orks.tankbustas.bomb-squigs': summary } }

it('finds an ability whose name a datasheet prints in the singular and VS Data in the plural', () =>
  expect(abilitySummaryIn(units, '@orks.tankbustas', 'Bomb Squig (1 per unit)')).toBe(summary))
