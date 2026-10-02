import { describe, expect, it } from 'vitest'
import type { CombatResult } from '../../../core/combat'
import type { LoadoutAxis, LoadoutRow, LoadoutScore } from '../../../core/combatLoadouts'
import { estimateKey, optionEstimates } from './loadoutSearch'

const result = (wipe: number): CombatResult => ({ kills: [], damage: [], wipe, meanKills: 0, meanDamage: 0 })
const axis = (key: string, options: string[], kind: 'single' | 'spread' = 'single'): LoadoutAxis => ({
  kind,
  key,
  name: key,
  owner: null,
  host: null,
  current: options[0]!,
  room: 2,
  uniform: false,
  exact: true,
  donor: options[0]!,
  limits: [],
  options: options.map((id) => ({ id, entry: id, name: id, group: key, count: 0, min: 0, max: 2, change: [] })),
})
const verified = (entries: [string, LoadoutScore][]) =>
  new Map(entries.map(([key, score]) => [JSON.stringify([key]), { assignment: [key], pick: { entryId: 'unit' }, points: 0, score }]))
const now = { ranged: result(0.2), melee: result(0.5) }
const pistol = axis('pistol', ['bolt', 'plasma', 'grip'])
const rows: LoadoutRow[] = [
  { axis: 0, option: 'bolt', step: 0, assignment: ['bolt'] },
  { axis: 0, option: 'plasma', step: 0, assignment: ['plasma'] },
  { axis: 0, option: 'grip', step: 0, assignment: ['grip'] },
]
const found = optionEstimates(
  [pistol],
  rows,
  verified([
    ['plasma', { ranged: result(0.4), melee: result(0.5) }],
    ['grip', { ranged: result(0.2), melee: result(0.5) }],
  ]),
  ['bolt'],
  now,
)

describe('option estimates', () => {
  it('estimates the option the unit already carries', () => {
    expect(found.get(estimateKey('pistol', 'bolt'))?.phases.ranged?.result.wipe).toBe(0.2)
  })
  it('marks the strongest option of a choice', () => {
    expect(found.get(estimateKey('pistol', 'plasma'))?.phases.ranged?.best).toBe(true)
  })
  it('leaves weaker options unmarked', () => {
    expect(found.get(estimateKey('pistol', 'grip'))?.phases.ranged?.best).toBe(false)
  })
  it('says nothing about a phase the choice does not change', () => {
    expect(found.get(estimateKey('pistol', 'plasma'))?.phases.melee).toBeUndefined()
  })
  it('marks nothing when no option beats the current one by enough to matter', () => {
    const close = optionEstimates([pistol], rows.slice(0, 2), verified([['plasma', { ranged: result(0.201), melee: null }]]), ['bolt'], now)
    expect(close.get(estimateKey('pistol', 'plasma'))?.phases.ranged?.best).toBe(false)
  })
  it('describes a squad option as one more model', () => {
    const squad = axis('squad', ['boltgun', 'plasma'], 'spread')
    const step = optionEstimates(
      [squad],
      [{ axis: 0, option: 'plasma', step: 1, assignment: ['plasma'] }],
      verified([['plasma', { ranged: result(0.3), melee: null }]]),
      [{ boltgun: 2, plasma: 0 }],
      now,
    )
    expect(step.get(estimateKey('squad', 'plasma'))?.step).toBe(1)
  })
  it('skips options the server did not confirm as legal', () => {
    const unchecked = optionEstimates([pistol], rows, new Map(), ['bolt'], now)
    expect(unchecked.get(estimateKey('pistol', 'plasma'))).toBeUndefined()
  })
})
