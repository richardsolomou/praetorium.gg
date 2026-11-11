import { describe, expect, it } from 'vitest'
import { reachChance, rosterGrades, type GradedUnit } from './rosterGrades'

const unit = (overrides: Partial<GradedUnit> = {}): GradedUnit => ({
  name: 'Unit',
  points: 100,
  move: 6,
  coreAbilities: [],
  removes: { horde: true, elite: true, vehicle: true, heavyVehicle: true, monster: true },
  ...overrides,
})

describe('reachChance', () => {
  it('needs an 8 on two dice after two 6″ moves across 20″', () => {
    expect(reachChance([], 6, 20)).toBeCloseTo(15 / 36)
  })

  it('charges 9″ from deep strike when walking would be slower', () => {
    expect(reachChance(['Deep Strike'], 5, 24)).toBeCloseTo(10 / 36)
  })

  it('starts infiltrators 9″ away', () => {
    expect(reachChance(['Infiltrators'], 6, 24)).toBeCloseTo(1)
  })

  it('adds a charge bonus to the roll', () => {
    expect(reachChance(['+1 To Charge Rolls'], 6, 20)).toBeCloseTo(21 / 36)
  })
})

describe('rosterGrades', () => {
  it('leaves heavy armour out at King of the Colosseum', () => {
    expect(rosterGrades([unit()], 600).rows.some((row) => row.key === 'heavyVehicle')).toBe(false)
  })

  it('names a reference target nothing in the list can take half of alone', () => {
    const grades = rosterGrades([unit({ removes: { horde: true, elite: true, vehicle: false, monster: true } })], 600)
    expect(grades.missing).toEqual(['Nothing in this list can take half the wounds of a Rhino on its own'])
  })

  it('grades nothing for a row the simulator could not calculate', () => {
    const grades = rosterGrades([unit({ removes: { horde: true, elite: true, vehicle: null, monster: true } })], 600)
    expect(grades.rows.find((row) => row.key === 'vehicle')?.grade).toBeNull()
  })

  it('does not call an uncalculated row missing', () => {
    expect(rosterGrades([unit({ removes: { horde: true, elite: true, vehicle: null, monster: true } })], 600).missing).toEqual([])
  })

  it('rates one vehicle killer a B at King of the Colosseum, where the opponent has at most one Toughness 9 unit', () => {
    const grades = rosterGrades(
      [unit(), ...Array.from({ length: 7 }, () => unit({ removes: { horde: true, elite: true, vehicle: false, monster: true } }))],
      600,
    )
    expect(grades.rows.find((row) => row.key === 'vehicle')?.grade).toBe('B')
  })

  it('counts each unit with its attachments as one towards the objectives', () => {
    const grades = rosterGrades(
      Array.from({ length: 5 }, () => unit()),
      600,
    )
    expect(grades.rows.find((row) => row.key === 'presence')?.grade).toBe('C')
  })
})
