import { describe, expect, it } from 'vitest'
import { completedBattleRound } from './battleProgress'

describe('battle round progress', () => {
  it.each([1, 2, 3, 4, 5])('does not mark playing round %s as complete', (round) => {
    expect(completedBattleRound('playing', round)).toBe(round - 1)
  })

  it('marks the fifth round complete when the battle finishes', () => {
    expect(completedBattleRound('finished', 5, 'completed')).toBe(5)
  })

  it('does not complete an interrupted round when the battle finishes early', () => {
    expect(completedBattleRound('finished', 4, 'finished-early')).toBe(3)
    expect(completedBattleRound('finished', 4, 'conceded')).toBe(3)
  })
})
