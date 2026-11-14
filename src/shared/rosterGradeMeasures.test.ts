import { describe, expect, it } from 'vitest'
import { datasheetFixture } from '../core/datasheet.fixtures'
import type { CombatantSnapshot } from '../core/combatMatchup'
import { unitTotal } from './rosterGradeMeasures'

const mixedUnit = (): CombatantSnapshot => ({
  sheet: datasheetFixture({
    profiles: [
      {
        id: 'light',
        name: 'Light model',
        type: 'Unit',
        values: [
          { name: 'W', value: '1' },
          { name: 'OC', value: '1' },
        ],
      },
      {
        id: 'heavy',
        name: 'Heavy model',
        type: 'Unit',
        values: [
          { name: 'W', value: '3' },
          { name: 'OC', value: '2' },
        ],
      },
    ],
  }),
  models: 8,
  carriers: [
    { name: 'Light model with equipment', modelProfileIds: ['light'], models: 5, weapons: [] },
    { name: 'Heavy model with equipment', modelProfileIds: ['heavy'], models: 3, weapons: [] },
  ],
})

describe('unitTotal', () => {
  it('counts the wounds of each model type in a mixed unit', () => {
    expect(unitTotal(mixedUnit(), 'wounds')).toBe(14)
  })

  it('counts the objective control of each model type in a mixed unit', () => {
    expect(unitTotal(mixedUnit(), 'objective-control')).toBe(11)
  })

  it('leaves an unmatched model type uncalculated', () => {
    const unit = mixedUnit()
    unit.carriers[0]!.modelProfileIds = ['missing']
    expect(unitTotal(unit, 'wounds')).toBeNull()
  })

  it('includes attached models with their own characteristics', () => {
    const unit = mixedUnit()
    unit.companions = [{ ...mixedUnit(), models: 1, carriers: [mixedUnit().carriers[1]!] }]
    unit.companions[0]!.carriers[0]!.models = 1
    expect(unitTotal(unit, 'wounds')).toBe(17)
  })
})
