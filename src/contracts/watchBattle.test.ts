import { expect, test } from 'vitest'
import demo from '../../mobile/watch/demo-battle.json'
import { parseWatchBattle } from './watchBattle'

test('the simulator fixture follows the watch wire contract', () => {
  expect(parseWatchBattle(demo)).toEqual(demo)
})

test.each([
  { version: 2 },
  { updatedAt: Infinity },
  { turnElapsedMs: -1 },
  { reminders: Array(21).fill(demo.reminders[0]) },
  { objectives: Array(11).fill(demo.objectives[0]) },
])('rejects an invalid watch snapshot %j', (patch) => {
  expect(parseWatchBattle({ ...demo, ...patch })).toBeNull()
})
