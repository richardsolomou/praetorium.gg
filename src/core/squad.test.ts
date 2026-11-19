import { describe, expect, it } from 'vitest'
import { squadMatch, squadPairing, squadPickRefusal, squadStepCount } from './squad'

const teams = (size: number) =>
  [Array.from({ length: size }, (_, index) => `a${index + 1}`), Array.from({ length: size }, (_, index) => `b${index + 1}`)] as const

/** Plays every step choosing the first players still free, as two teams that never think would. */
function pairAll(size: number) {
  const members = teams(size)
  const revealed: [string[], string[]][] = []
  for (let state = squadPairing(members, revealed); state.step; state = squadPairing(members, revealed)) {
    const pick = (side: 0 | 1) => {
      const stage = state.stages.at(-1)
      if (state.step!.kind === 'defender') return [state.pools[side][0]!]
      if (state.step!.kind === 'attackers') return state.pools[side].filter((id) => id !== stage!.defenders![side]).slice(0, 2)
      return [stage!.attackers![1 - side]![0]!]
    }
    revealed.push([pick(0), pick(1)])
  }
  return squadPairing(members, revealed)
}

describe('team pairing', () => {
  it.each([3, 4, 5, 6, 7, 8])('pairs every player of a team of %i exactly once', (size) => {
    const { games } = pairAll(size)
    expect([games.map(([a]) => a).toSorted(), games.map(([, b]) => b).toSorted()]).toEqual(teams(size).map((team) => team.toSorted()))
  })

  it('takes three choices a stage, with a last stage at three or four players left', () => {
    expect([3, 4, 5, 6, 7, 8].map(squadStepCount)).toEqual([3, 3, 6, 6, 9, 9])
  })

  it('sets each defender against the attacker their team accepted', () => {
    const revealed: [string[], string[]][] = [
      [['a1'], ['b1']],
      [
        ['a2', 'a3'],
        ['b2', 'b3'],
      ],
      [['b3'], ['a2']],
    ]
    expect(squadPairing(teams(3), revealed).games).toEqual([
      ['a1', 'b3'],
      ['a2', 'b1'],
      ['a3', 'b2'],
    ])
  })

  it('returns a refused attacker to its pool before the last stage', () => {
    const revealed: [string[], string[]][] = [
      [['a1'], ['b1']],
      [
        ['a2', 'a3'],
        ['b2', 'b3'],
      ],
      [['b2'], ['a2']],
    ]
    expect(squadPairing(teams(5), revealed).pools).toEqual([
      ['a3', 'a4', 'a5'],
      ['b3', 'b4', 'b5'],
    ])
  })

  it('pairs the two players nobody chose at the last stage of four', () => {
    const revealed: [string[], string[]][] = [
      [['a1'], ['b1']],
      [
        ['a2', 'a3'],
        ['b2', 'b3'],
      ],
      [['b2'], ['a2']],
    ]
    expect(squadPairing(teams(4), revealed).games.at(-1)).toEqual(['a4', 'b4'])
  })

  it('refuses an attacker who is already defending', () => {
    const state = squadPairing(teams(5), [[['a1'], ['b1']]])
    expect(squadPickRefusal(state, 0, ['a1', 'a2'])).toBe('not-available')
  })

  it('refuses accepting a player the other team did not send', () => {
    const state = squadPairing(teams(5), [
      [['a1'], ['b1']],
      [
        ['a2', 'a3'],
        ['b2', 'b3'],
      ],
    ])
    expect(squadPickRefusal(state, 0, ['b4'])).toBe('not-available')
  })

  it('refuses a choice once every game is paired', () => {
    expect(squadPickRefusal(pairAll(3), 0, ['a1'])).toBe('paired')
  })
})

describe('team match result', () => {
  const game = (outcome: 'a' | 'b' | 'draw' | null, vp: [number, number] = [0, 0]) => ({ outcome, vp })

  it('is undecided until every game has finished', () => {
    expect(squadMatch([game('a'), game(null), game('a')], 3, 'games').outcome).toBeNull()
  })

  it('goes to the team that won more games, a draw counting half', () => {
    expect(squadMatch([game('a'), game('b'), game('draw')], 3, 'games')).toEqual({ outcome: 'draw', score: [1.5, 1.5] })
  })

  it('goes to the team with more victory points when the organizer scores them', () => {
    expect(squadMatch([game('a', [60, 50]), game('b', [10, 90]), game('a', [70, 65])], 3, 'points')).toEqual({
      outcome: 'b',
      score: [140, 205],
    })
  })
})
