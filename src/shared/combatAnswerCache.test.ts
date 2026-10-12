import { expect, it } from 'vitest'
import { CombatAnswerCache } from './combatAnswerCache'
import { DEFAULT_COMBAT_OPTIONS } from '../core/combat'
import { resolveCombatRequest, type CombatRequest } from '../core/combatMatchup'

const request = (damage = 0): CombatRequest => ({
  ranged: {
    weapons: [],
    options: DEFAULT_COMBAT_OPTIONS,
    target: {
      groups: [{ models: 1, wounds: 2, toughness: 4, save: 3, invulnerable: null }],
      feelNoPain: null,
      damage,
    },
  },
  melee: null,
})

it('does not reuse an answer for changed wounds or phases', () => {
  const cache = new CombatAnswerCache(1024 * 1024)
  cache.write(request(), resolveCombatRequest(request()))
  expect([cache.read(request(1)), cache.read({ ranged: null, melee: request().ranged })]).toEqual([undefined, undefined])
})

it('protects both stored and returned distributions from mutation', () => {
  const cache = new CombatAnswerCache(1024 * 1024)
  const answer = resolveCombatRequest(request())
  const expected = structuredClone(answer)
  cache.write(request(), answer)
  answer.ranged!.result!.kills[0] = 99
  cache.read(request())!.ranged!.result!.damage[0] = 99
  expect(cache.read(request())).toEqual(expected)
})

it('evicts the least recently used answer at the entry limit', () => {
  const cache = new CombatAnswerCache(1024 * 1024, 2)
  cache.write(request(), resolveCombatRequest(request()))
  cache.write(request(1), resolveCombatRequest(request(1)))
  cache.read(request())
  cache.write({ ranged: null, melee: null }, { ranged: null, melee: null })
  expect(cache.read(request(1))).toBeUndefined()
})

it('bounds bytes even when the entry count is small', () => {
  const answer = resolveCombatRequest(request())
  const size = (JSON.stringify(request()).length + JSON.stringify(answer).length) * 2
  const cache = new CombatAnswerCache(size + 1)
  cache.write(request(), answer)
  cache.write(request(1), answer)
  expect(cache.read(request())).toBeUndefined()
})

it('refuses oversized answers and failed phases', () => {
  const cache = new CombatAnswerCache(10)
  cache.write(request(), resolveCombatRequest(request()))
  expect(cache.read(request())).toBeUndefined()
  const larger = new CombatAnswerCache(1024 * 1024)
  larger.write(request(), { ranged: { error: 'Too large' }, melee: null })
  expect(larger.read(request())).toBeUndefined()
})
