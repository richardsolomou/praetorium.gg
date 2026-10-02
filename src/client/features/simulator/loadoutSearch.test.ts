import { expect, it } from 'vitest'
import type { CombatResult } from '../../../core/combat'
import { listedLoadouts } from './loadoutSearch'

const result = (wipe: number, meanDamage = 0): CombatResult => ({ kills: [], damage: [], wipe, meanKills: 0, meanDamage })
const entry = (option: string, wipe: number, meanDamage = 0) => ({ assignment: [option], result: result(wipe, meanDamage) })
const weaker = Array.from({ length: 12 }, (_, at) => entry(`option ${at}`, 0.5 + at / 100))

it('lists the current loadout even when it ranks below the strongest', () => {
  const listed = listedLoadouts([entry('current', 0), ...weaker], ['current'], result(0.61))
  expect(listed.at(-1)?.assignment).toEqual(['current'])
})
it('ranks loadouts best first', () => {
  const listed = listedLoadouts([entry('current', 0), entry('weak', 0.2), entry('strong', 0.4)], ['current'], result(0.4))
  expect(listed.map((row) => row.assignment[0])).toEqual(['strong', 'weak', 'current'])
})
it('marks the row with the suggested result as best', () => {
  const listed = listedLoadouts([entry('current', 0), entry('strong', 0.4, 3)], ['current'], result(0.4, 3))
  expect(listed.filter((row) => row.best).map((row) => row.assignment[0])).toEqual(['strong'])
})
it('marks the current loadout as best when nothing beats it', () => {
  const listed = listedLoadouts([entry('current', 0.4), entry('weak', 0.2)], ['current'], result(0.4))
  expect(listed.find((row) => row.best)?.assignment).toEqual(['current'])
})
