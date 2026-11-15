import { describe, expect, it } from 'vitest'
import { reduceBattle } from './battle'
import { battleLogThroughSeq, battleTimeline } from './battleReplay'
import { ALICE, BOB, log, PLAYERS, started, turns } from './battle.fixtures'

const fiveRounds = () =>
  log(
    ...started(),
    ...Array.from({ length: 5 }, () => [
      [ALICE, { kind: 'score', category: 'primary', delta: 5 }] as [string, { kind: 'score'; category: 'primary'; delta: number }],
      ...turns(6, ALICE),
      ...turns(6, BOB),
    ]).flat(),
  )

describe('battle replay timeline', () => {
  it('has a stop for every command across five rounds', () => {
    const history = fiveRounds()
    const points = battleTimeline(PLAYERS, history)
    expect({ stops: points.length, rounds: [...new Set(points.map((point) => point.round).filter(Boolean))] }).toEqual({
      stops: history.length,
      rounds: [1, 2, 3, 4, 5],
    })
  })

  it('shows a score only after its command', () => {
    const history = log(...started(), [ALICE, { kind: 'score', category: 'primary', delta: 5 }])
    expect(reduceBattle(PLAYERS, battleLogThroughSeq(history, 3)).players[0]?.primary).toBe(0)
    expect(reduceBattle(PLAYERS, battleLogThroughSeq(history, 4)).players[0]?.primary).toBe(5)
  })

  it('shows an undone action and then its reversal', () => {
    const history = log(...started(), [ALICE, { kind: 'score', category: 'primary', delta: 5 }], [BOB, { kind: 'undo', target: 4 }])
    expect(reduceBattle(PLAYERS, battleLogThroughSeq(history, 4)).players[0]?.primary).toBe(5)
    expect(reduceBattle(PLAYERS, battleLogThroughSeq(history, 5)).players[0]?.primary).toBe(0)
    expect(battleTimeline(PLAYERS, history)).toHaveLength(5)
  })
})
