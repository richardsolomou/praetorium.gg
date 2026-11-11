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
  removes: { horde: 1, elite: 1, vehicle: 1, heavyVehicle: 1, monster: 1 },
  volleyLoss: 0.2,
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

const categoryOf = (grades: ReturnType<typeof rosterGrades>, key: string) => grades.categories.find((category) => category.key === key)

describe('rosterGrades', () => {
  it('leaves heavy armour out at King of the Colosseum', () => {
    expect(rowOf(rosterGrades([unit()], 600), 'heavyVehicle')).toBeUndefined()
  })

  it('names a reference target nothing in the list can take half of alone', () => {
    const grades = rosterGrades([unit({ removes: { horde: 1, elite: 1, vehicle: 0.4, heavyVehicle: 1, monster: 1 } })], 2000)
    expect(grades.missing).toEqual(['a Rhino'])
  })

  it('grades nothing for a row the simulator could not calculate', () => {
    const grades = rosterGrades([unit({ removes: { horde: 1, elite: 1, vehicle: null, heavyVehicle: 1, monster: 1 } })], 2000)
    expect(rowOf(grades, 'vehicle')?.grade).toBeNull()
  })

  it('does not call an uncalculated row missing', () => {
    const grades = rosterGrades([unit({ removes: { horde: 1, elite: 1, vehicle: null, heavyVehicle: 1, monster: 1 } })], 2000)
    expect(grades.missing).toEqual([])
  })

  it('rates removing one vehicle a turn a B at King of the Colosseum, where the opponent has at most one Toughness 9 unit', () => {
    const grades = rosterGrades([unit({ removes: { horde: 1, elite: 1, vehicle: 1, monster: 1 } })], 600)
    expect(rowOf(grades, 'vehicle')?.grade).toBe('B')
  })

  it('does not lower damage for a cheap unit that kills nothing', () => {
    const killers = Array.from({ length: 6 }, () => unit({ points: 300 }))
    const screen = unit({ points: 40, removes: { horde: 0, elite: 0, vehicle: 0, heavyVehicle: 0, monster: 0 }, volleyLoss: 1 })
    expect(categoryOf(rosterGrades([...killers, screen], 2000), 'damage')?.score).toBe(
      categoryOf(rosterGrades(killers, 2000), 'damage')?.score,
    )
  })

  it('compares a small list with lists of its own size', () => {
    const units = Array.from({ length: 5 }, () => unit({ points: 120 }))
    expect(rowOf(rosterGrades(units, 600), 'presence')!.score!).toBeGreaterThan(rowOf(rosterGrades(units, 2000), 'presence')!.score!)
  })
})
