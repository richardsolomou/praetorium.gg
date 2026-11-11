import { describe, expect, it } from 'vitest'
import { movementToolsFrom, unitGenerationFrom } from './rosterGradeUtility'

describe('movement tools for roster grades', () => {
  it('recognises unit-wide Advance and charge permission', () => {
    expect(movementToolsFrom('This unit is eligible to declare a charge in a turn in which it Advanced.')).toEqual(['Advance and charge'])
  })

  it('keeps a casualty-triggered surge conditional', () => {
    expect(
      movementToolsFrom(
        'In your opponent’s Shooting phase, when an enemy unit has shot, if a model in this unit was destroyed by those attacks, this unit can make a **surge move** of up to D6".',
      ),
    ).toEqual(['Up to D6″ surge after enemy shooting destroys a model'])
  })

  it('does not grant a bearer-only move to an entire attached unit', () => {
    expect(movementToolsFrom('This model is eligible to declare a charge in a turn in which it Advanced.')).toEqual([])
  })
})

describe('unit generation for roster grades', () => {
  it('recognises a shared shooting replacement without relying on the ability name', () => {
    expect(
      unitGenerationFrom(
        'Once per turn, in your Shooting phase, one unit with this ability can use it instead of making any attacks with its ranged weapons. You can add one new **MINE** unit to your army.',
      ),
    ).toEqual([{ unit: 'MINE', trigger: 'shooting', shared: true }])
  })

  it('keeps a kill-triggered spawn conditional', () => {
    expect(
      unitGenerationFrom(
        'Each time an **^^Infantry^^** model is destroyed by an attack made with this model’s weapon, you can add one new **^^SWARM^^** unit to your army.',
      ),
    ).toEqual([{ unit: 'SWARM', trigger: 'kill', shared: false }])
  })

  it('does not count restoring models as creating an independent unit', () => {
    expect(unitGenerationFrom('Return D3 destroyed models to this unit.')).toEqual([])
  })

  it('does not guess the conditions of another spawning ability', () => {
    expect(unitGenerationFrom('If a special condition is met, add one new SWARM unit to your army.')).toEqual([])
  })
})
