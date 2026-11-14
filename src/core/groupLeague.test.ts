import { describe, expect, it } from 'vitest'
import { LEAGUE_DEADLINE_REMINDER_MS, leagueDeadlineReminderDue, leagueDraw, leagueFixtureStatus } from './groupLeague'

const players = (count: number) => Array.from({ length: count }, (_, index) => `p${index}`)
const pairKey = ([a, b]: [string, string | null]) => [a, b ?? 'bye'].toSorted().join('|')

describe('league draw', () => {
  it('has every pair meet exactly once', () => {
    const meetings = leagueDraw(players(6), 7).flat().map(pairKey).toSorted()
    const expected = players(6)
      .flatMap((one, index) =>
        players(6)
          .slice(index + 1)
          .map((other) => [one, other].toSorted().join('|')),
      )
      .toSorted()
    expect(meetings).toEqual(expected)
  })

  it('gives each player one bye when the count is odd', () => {
    const byes = leagueDraw(players(5), 7)
      .flat()
      .filter(([, b]) => b === null)
      .map(([a]) => a)
      .toSorted()
    expect(byes).toEqual(players(5))
  })

  it('seats nobody twice in a round', () => {
    const rounds = leagueDraw(players(7), 3)
    expect(rounds.every((round) => new Set(round.flatMap(([a, b]) => (b ? [a, b] : [a]))).size === 7)).toBe(true)
  })

  it('draws the same fixtures from the same seed and players in any order', () => {
    expect(leagueDraw(players(8).toReversed(), 42)).toEqual(leagueDraw(players(8), 42))
  })

  it('draws different fixtures from a different seed', () => {
    expect(leagueDraw(players(8), 42)).not.toEqual(leagueDraw(players(8), 43))
  })
})

describe('a withdrawn player’s fixtures', () => {
  const stillPlaying = (userId: string) => userId !== 'gone'

  it('void the ones not yet played', () => {
    expect(leagueFixtureStatus({ aId: 'gone', bId: 'b', battle: { status: 'playing' } }, stillPlaying)).toBe('void')
  })

  it('keep the ones already finished', () => {
    expect(leagueFixtureStatus({ aId: 'b', bId: 'gone', battle: { status: 'finished' } }, stillPlaying)).toBe('finished')
  })
})

describe('a round’s deadline reminder', () => {
  const deadline = 10 * LEAGUE_DEADLINE_REMINDER_MS

  it('waits until the deadline is less than a day away', () => {
    expect(leagueDeadlineReminderDue(deadline, null, deadline - LEAGUE_DEADLINE_REMINDER_MS - 1)).toBe(false)
    expect(leagueDeadlineReminderDue(deadline, null, deadline - LEAGUE_DEADLINE_REMINDER_MS)).toBe(true)
  })

  it('stops once the deadline has passed', () => {
    expect(leagueDeadlineReminderDue(deadline, null, deadline)).toBe(false)
  })

  it('goes out once per deadline, and again after the deadline moves', () => {
    const now = deadline - 1
    expect(leagueDeadlineReminderDue(deadline, deadline, now)).toBe(false)
    expect(leagueDeadlineReminderDue(deadline, deadline - 1000, now)).toBe(true)
  })
})
