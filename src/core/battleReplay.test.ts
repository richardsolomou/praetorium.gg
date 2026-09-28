import { describe, expect, it } from 'vitest'
import { reduceBattle } from './battle'
import { battleLogThroughSeq, battleTimeline } from './battleReplay'
import { battleReport } from './battleReport'
import { battleView } from './battleView'
import { ALICE, BOB, log, NAMES, PLAYERS, started, turns } from './battle.fixtures'

const fiveRounds = () =>
  log(
    ...started(),
    [ALICE, { kind: 'select-secret', secondary: { key: 'secret', name: 'Hidden Mission' } }],
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

  it('keeps a later secret reveal out of an earlier spectator frame and report', () => {
    const history = log(
      ...started(),
      [ALICE, { kind: 'select-secret', secondary: { key: 'secret', name: 'Hidden Mission' } }],
      ...turns(6, ALICE),
      ...turns(6, BOB),
      [ALICE, { kind: 'reveal-secret' }],
      [ALICE, { kind: 'end-battle', reason: 'finished-early' }],
    )
    const prefix = battleLogThroughSeq(history, 4)
    const view = battleView({ token: 'battle' }, NAMES, reduceBattle(PLAYERS, prefix), '')
    expect(view.players[0]?.secondaries[0]?.name).toBe('Secret mission')
    expect(
      battleReport(NAMES, prefix, PLAYERS, '')
        .map((entry) => entry.text)
        .join(' '),
    ).not.toContain('Hidden Mission')
  })
})
