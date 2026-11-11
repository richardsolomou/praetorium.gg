import { describe, expect, it } from 'vitest'
import { gradeOf, percentileOf, reachChance, rosterGrades, type GradedUnit } from './rosterGrades'

const unit = (overrides: Partial<GradedUnit> = {}): GradedUnit => ({
  name: 'Unit',
  points: 100,
  move: 6,
  objectiveControl: 5,
  deepStrike: false,
  infiltrators: false,
  scouts: 0,
  chargeBonus: 0,
  removes: { horde: true, elite: true, vehicle: true, heavyVehicle: true, monster: true },
  survives: true,
  ...overrides,
})

const rowOf = (grades: ReturnType<typeof rosterGrades>, key: string) =>
  grades.categories.flatMap((category) => category.rows).find((row) => row.key === key)

describe('reachChance', () => {
  it('needs an 8 on two dice after two 6″ moves across 20″', () => {
    expect(reachChance(unit(), 20)).toBeCloseTo(15 / 36)
  })

  it('charges 9″ from deep strike when walking would be slower', () => {
    expect(reachChance(unit({ move: 5, deepStrike: true }), 24)).toBeCloseTo(10 / 36)
  })

  it('starts infiltrators 9″ away', () => {
    expect(reachChance(unit({ infiltrators: true }), 24)).toBeCloseTo(1)
  })

  it('adds a charge bonus to the roll', () => {
    expect(reachChance(unit({ chargeBonus: 1 }), 20)).toBeCloseTo(21 / 36)
  })
})

describe('percentileOf', () => {
  const quantiles = [0, 0, 0, 0.1, 0.2]

  it('places a value many lists share in the middle of their run', () => {
    expect(percentileOf(0, quantiles)).toBe(25)
  })

  it('interpolates between neighbouring percentiles', () => {
    expect(percentileOf(0.15, quantiles)).toBeCloseTo(87.5)
  })

  it('scores 100 past every tournament list', () => {
    expect(percentileOf(0.5, quantiles)).toBe(100)
  })
})

describe('gradeOf', () => {
  it('splits A from B at the 75th percentile', () => {
    expect([gradeOf(75), gradeOf(74)]).toEqual(['A', 'B'])
  })
})

describe('rosterGrades', () => {
  it('leaves heavy armour out at King of the Colosseum', () => {
    expect(rowOf(rosterGrades([unit()], 600), 'heavyVehicle')).toBeUndefined()
  })

  it('names a reference target nothing in the list can take half of alone', () => {
    const grades = rosterGrades([unit({ removes: { horde: true, elite: true, vehicle: false, monster: true } })], 600)
    expect(grades.missing).toEqual(['a Rhino'])
  })

  it('grades nothing for a row the simulator could not calculate', () => {
    const grades = rosterGrades([unit({ removes: { horde: true, elite: true, vehicle: null, monster: true } })], 600)
    expect(rowOf(grades, 'vehicle')?.grade).toBeNull()
  })

  it('does not call an uncalculated row missing', () => {
    expect(rosterGrades([unit({ removes: { horde: true, elite: true, vehicle: null, monster: true } })], 600).missing).toEqual([])
  })

  it('rates one vehicle killer a B at King of the Colosseum, where the opponent has at most one Toughness 9 unit', () => {
    const grades = rosterGrades(
      [unit(), ...Array.from({ length: 7 }, () => unit({ removes: { horde: true, elite: true, vehicle: false, monster: true } }))],
      600,
    )
    expect(rowOf(grades, 'vehicle')?.grade).toBe('B')
  })

  it('grades five units for five objectives a C', () => {
    expect(
      rowOf(
        rosterGrades(
          Array.from({ length: 5 }, () => unit()),
          600,
        ),
        'presence',
      )?.grade,
    ).toBe('C')
  })
})
