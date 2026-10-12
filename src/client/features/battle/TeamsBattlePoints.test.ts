import { expect, it } from 'vitest'
import { teamsBattlePointsGap } from './TeamsBattlePoints'

const solo = { armies: [{}] } as never
const pair = { armies: [{}, {}] } as never

it('scores a finished two-player battle', () => {
  expect(teamsBattlePointsGap({ result: { reason: 'completed', concededBy: null } } as never, [solo, solo])).toBeNull()
})

it('gives a conceded battle no battle points', () => {
  expect(teamsBattlePointsGap({ result: { reason: 'conceded', concededBy: 'a' } } as never, [solo, solo])).toMatch(/conceded/)
})

it('gives a team battle no battle points', () => {
  expect(teamsBattlePointsGap({ result: { reason: 'completed', concededBy: null } } as never, [pair, solo])).toMatch(/team battle/)
})
