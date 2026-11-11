import { describe, expect, it } from 'vitest'
import { gradeOf, percentileOf, reachChance, rosterGrades, scaled, type GradedUnit } from './rosterGrades'

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
  it('splits A from B at 85', () => {
    expect([gradeOf(85), gradeOf(84)]).toEqual(['A', 'B'])
  })
})

describe('scaled', () => {
  it('scores a typical tournament list 70', () => {
    expect(scaled(50)).toBe(70)
  })

  it('interpolates between the curve points', () => {
    expect(scaled(5)).toBe(20)
  })
})

/** A faction without enough tournament lists of its own, so categories compare it with every list. */
const grade = (units: GradedUnit[], limit: number) => rosterGrades(units, limit, 'no-such-faction')

const categoryOf = (grades: ReturnType<typeof rosterGrades>, key: string) => grades.categories.find((category) => category.key === key)

describe('rosterGrades', () => {
  it('names the scope of the mobility benchmark', () => {
    expect(categoryOf(grade([unit()], 600), 'mobility')?.label).toBe('Charge & deployment')
  })

  it('shows normal movement separately from conditional movement', () => {
    const grades = grade([unit({ name: 'Fast unit', move: 10, movementTools: ['Advance and charge'] })], 600)
    expect(rowOf(grades, 'movement')?.units).toEqual(['Fast unit: 10″ normal move; Advance and charge'])
  })

  it('does not treat conditional movement as guaranteed charge reach', () => {
    expect(grade([unit({ movementTools: ['Advance and charge'] })], 600).score).toBe(grade([unit()], 600).score)
  })

  it('shows generated units separately from starting board presence', () => {
    const grades = grade([unit({ unitGeneration: [{ unit: 'MINE', trigger: 'shooting', shared: true }] })], 600)
    expect(rowOf(grades, 'generation')?.detail).toContain('not scored')
  })

  it('does not award an uncalibrated score bonus for generated units', () => {
    const generated = unit({ unitGeneration: [{ unit: 'SWARM', trigger: 'kill', shared: false }] })
    expect(grade([generated], 600).categories.map((category) => category.score)).toEqual(
      grade([unit()], 600).categories.map((category) => category.score),
    )
  })

  it('does not count possible future units as starting board presence', () => {
    const generated = unit({ unitGeneration: [{ unit: 'MINE', trigger: 'shooting', shared: true }] })
    expect(rowOf(grade([generated], 600), 'presence')?.detail).toBe('1 unit for 5 objectives')
  })

  it('leaves heavy armour out at King of the Colosseum', () => {
    expect(rowOf(grade([unit()], 600), 'heavyVehicle')).toBeUndefined()
  })

  it('names a reference target nothing in the list can take half of alone', () => {
    const grades = grade([unit({ removes: { horde: 1, elite: 1, vehicle: 0.4, heavyVehicle: 1, monster: 1 } })], 2000)
    expect(grades.missing).toEqual(['a Rhino'])
  })

  it('grades nothing for a row the simulator could not calculate', () => {
    const grades = grade([unit({ removes: { horde: 1, elite: 1, vehicle: null, heavyVehicle: 1, monster: 1 } })], 2000)
    expect(rowOf(grades, 'vehicle')?.grade).toBeNull()
  })

  it('does not call an uncalculated row missing', () => {
    const grades = grade([unit({ removes: { horde: 1, elite: 1, vehicle: null, heavyVehicle: 1, monster: 1 } })], 2000)
    expect(grades.missing).toEqual([])
  })

  it('leaves objective holding ungraded when model OC cannot be counted', () => {
    expect(rowOf(grade([unit({ objectiveControl: null })], 600), 'hold')?.grade).toBeNull()
  })

  it('names units whose objective control could not be counted', () => {
    const grades = grade([unit({ name: 'Unknown unit', objectiveControl: null }), unit({ objectiveControl: 10 })], 600)
    expect(rowOf(grades, 'hold')?.notCalculated).toEqual(['Unknown unit'])
  })

  it('credits at most two units that can remove a vehicle at King of the Colosseum, where the opponent has one Toughness 9 unit', () => {
    const killers = (count: number) =>
      Array.from({ length: count }, () => unit({ removes: { horde: 0, elite: 0, vehicle: 1, monster: 0 } }))
    expect(rowOf(grade(killers(3), 600), 'vehicle')?.score).toBe(rowOf(grade(killers(2), 600), 'vehicle')?.score)
  })

  it('does not lower damage for a cheap unit that kills nothing', () => {
    const killers = Array.from({ length: 6 }, () => unit({ points: 300 }))
    const screen = unit({ points: 40, removes: { horde: 0, elite: 0, vehicle: 0, heavyVehicle: 0, monster: 0 }, volleyLoss: 1 })
    expect(categoryOf(grade([...killers, screen], 2000), 'damage')?.score).toBe(categoryOf(grade(killers, 2000), 'damage')?.score)
  })

  it("places a list among its own army's tournament lists", () => {
    expect(rosterGrades([unit()], 2000, 'Xenos - Necrons').comparedWith).toBe('Necrons')
  })

  it("places a chapter with too few tournament lists among its parent's", () => {
    expect(rosterGrades([unit()], 2000, 'Imperium - Adeptus Astartes - Black Templars').comparedWith).toBe('Adeptus Astartes')
  })

  it('places an army with no tournament lists among every faction', () => {
    expect(grade([unit()], 2000).comparedWith).toBeNull()
  })

  it('keeps the overall score within its categories', () => {
    const grades = grade(
      Array.from({ length: 10 }, () => unit({ points: 200 })),
      2000,
    )
    const scores = grades.categories.map((category) => category.score!)
    expect(grades.score! >= Math.min(...scores) && grades.score! <= Math.max(...scores)).toBe(true)
  })

  it('compares a small list with lists of its own size', () => {
    const units = Array.from({ length: 5 }, () => unit({ points: 120 }))
    expect(rowOf(grade(units, 600), 'presence')!.score!).toBeGreaterThan(rowOf(grade(units, 2000), 'presence')!.score!)
  })
})
