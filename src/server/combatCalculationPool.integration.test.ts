import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { expect, it } from 'vitest'
import { DEFAULT_COMBAT_OPTIONS } from '../core/combat'
import { resolveCombatRequest, type CombatRequest } from '../core/combatMatchup'
import { CombatCalculationPool } from './combatCalculationPool'

it('runs the shared engine in a real Node worker and returns the same distributions', async () => {
  const request: CombatRequest = {
    ranged: {
      weapons: [
        {
          count: 3,
          attacks: { dice: 1, sides: 6, bonus: 1 },
          skill: 3,
          strength: 5,
          ap: -1,
          damage: { dice: 0, sides: 6, bonus: 2 },
          torrent: false,
          lethal: true,
          sustained: 1,
          devastating: false,
          criticalWound: 6,
          twinLinked: false,
          ignoresCover: false,
          psychic: false,
          blast: 0,
          rapidFire: 0,
          melta: 0,
          heavy: false,
          lance: false,
        },
      ],
      options: DEFAULT_COMBAT_OPTIONS,
      target: {
        groups: [{ models: 5, toughness: 4, wounds: 2, save: 3, invulnerable: null }],
        feelNoPain: null,
      },
    },
    melee: null,
  }
  request.melee = { ...request.ranged!, options: { ...DEFAULT_COMBAT_OPTIONS, phase: 'melee' } }
  const pool = new CombatCalculationPool(
    () => new Worker(path.resolve('src/server/combatCalculation.worker.ts'), { execArgv: ['--import', 'tsx'] }),
  )
  try {
    expect(await pool.calculate(request, new AbortController().signal)).toEqual(resolveCombatRequest(request))
  } finally {
    await pool.close()
  }
})
