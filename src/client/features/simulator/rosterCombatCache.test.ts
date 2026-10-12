import { beforeEach, expect, it } from 'vitest'
import { clearRosterCombatCache, readRosterCombatCache, writeRosterCombatCache } from './rosterCombatCache'
import type { RosterCombatSummary } from './rosterCombat'

const results: RosterCombatSummary[] = [{ ranged: { result: { meanDamage: 3, meanKills: 1, wipe: 0.5 } }, melee: {}, combined: {} }]
beforeEach(clearRosterCombatCache)

it('evicts the least recently used comparison after twenty entries', () => {
  for (let index = 0; index < 20; index++) writeRosterCombatCache(`${index}`, results)
  readRosterCombatCache('0')
  writeRosterCombatCache('20', results)
  expect({ retained: readRosterCombatCache('0'), evicted: readRosterCombatCache('1') }).toEqual({ retained: results, evicted: undefined })
})

it('bounds total retained content to eight megabytes', () => {
  const key = 'a'.repeat(1024 * 1024)
  for (let index = 0; index < 4; index++) writeRosterCombatCache(`${key}${index}`, results)
  expect({ oldest: readRosterCombatCache(`${key}0`), newest: readRosterCombatCache(`${key}3`) }).toEqual({
    oldest: undefined,
    newest: results,
  })
})

it('does not retain a single comparison larger than the cache budget', () => {
  const key = 'a'.repeat(4 * 1024 * 1024)
  writeRosterCombatCache(key, results)
  expect(readRosterCombatCache(key)).toBeUndefined()
})

it('isolates retained summaries from caller mutations', () => {
  writeRosterCombatCache('matchup', results)
  readRosterCombatCache('matchup')![0]!.ranged.result!.meanDamage = 999
  expect(readRosterCombatCache('matchup')![0]!.ranged.result!.meanDamage).toBe(3)
})
