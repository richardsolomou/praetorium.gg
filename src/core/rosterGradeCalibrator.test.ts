import { describe, expect, it } from 'vitest'
import { calibrate, calibrationLists, MIN_PEERS } from './rosterGradeCalibrator'
import type { GradedUnit } from './rosterGrades'

const unit = (index: number): GradedUnit => ({
  name: `Unit ${index}`,
  points: 60 + ((index * 37) % 200),
  move: 6,
  objectiveControl: index % 12,
  deepStrike: index % 5 === 0,
  infiltrators: false,
  scouts: 0,
  chargeBonus: 0,
  removes: { horde: (index % 7) / 4, elite: (index % 5) / 4, vehicle: (index % 3) / 2, heavyVehicle: (index % 4) / 4, monster: 0.5 },
  volleyLoss: (index % 9) / 10,
})

const lists = (catalogueName: string, count: number, offset = 0) =>
  Array.from({ length: count }, (_, list) => ({
    id: `${catalogueName}-${list}`,
    catalogueName,
    units: Array.from({ length: 8 + (list % 6) }, (_unit, index) => unit(offset + list * 3 + index)),
  }))

describe('calibrate', () => {
  it('draws the same smaller lists every run, each within its points', () => {
    const tournament = lists('Xenos - Necrons', 5)
    const drawn = calibrationLists(tournament)
    expect(calibrationLists(tournament)).toEqual(drawn)
    for (const list of drawn) expect(list.units.reduce((total, member) => total + member.points, 0)).toBeLessThanOrEqual(list.size)
  })

  it(`keys a catalogue or parent only once it has ${MIN_PEERS} lists, so a chapter with fewer is placed among every chapter`, () => {
    const { peers } = calibrate(
      calibrationLists([
        ...lists('Imperium - Adeptus Astartes - Blood Angels', MIN_PEERS),
        ...lists('Imperium - Adeptus Astartes - Ultramarines', MIN_PEERS - 1, 500),
      ]),
    )
    expect(Object.keys(peers[2000])).toEqual(['', 'Imperium - Adeptus Astartes', 'Imperium - Adeptus Astartes - Blood Angels'])
  })
})
