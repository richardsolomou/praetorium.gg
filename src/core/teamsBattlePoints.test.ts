import { expect, it } from 'vitest'
import { teamsBattlePoints } from './teamsBattlePoints'

it('scores the publisher example of 86 to 54 as 16 and 4', () => {
  expect([teamsBattlePoints(86, 54), teamsBattlePoints(54, 86)]).toEqual([16, 4])
})

it.each([
  [0, 10],
  [5, 10],
  [6, 11],
  [10, 11],
  [11, 12],
  [45, 18],
  [46, 19],
  [50, 19],
  [51, 20],
  [90, 20],
])('a lead of %i VP scores %i battle points', (lead, points) => {
  expect(teamsBattlePoints(40 + lead, 40)).toBe(points)
})

it('always gives both players 20 battle points between them', () => {
  for (let vp = 0; vp <= 100; vp += 1) expect(teamsBattlePoints(vp, 37) + teamsBattlePoints(37, vp)).toBe(20)
})
