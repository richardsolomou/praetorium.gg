import { expect, it } from 'vitest'
import { journalGameSchema, journalOrder, journalTotals, scoredResult } from './gameJournal'

const game = {
  id: 'game',
  eventId: null,
  playedOn: '2026-10-03',
  factionId: null,
  army: null,
  opponentName: null,
  opponentFactionId: null,
  score: null,
  opponentScore: null,
  result: 'won' as const,
  notes: null,
}

it.each([
  [80, 60, 'won'],
  [60, 80, 'lost'],
  [70, 70, 'drawn'],
] as const)('reads %i to %i as %s', (score, opponentScore, result) => {
  expect(scoredResult(score, opponentScore)).toBe(result)
})

it('reads no result while a score is missing', () => {
  expect(scoredResult(80, null)).toBeNull()
})

it('accepts a result without scores', () => {
  expect(journalGameSchema.safeParse({ ...game, result: 'drawn' }).success).toBe(true)
})

it('refuses a result the scores contradict', () => {
  expect(journalGameSchema.safeParse({ ...game, score: 50, opponentScore: 70, result: 'won' }).success).toBe(false)
})

it('refuses a day that does not exist', () => {
  expect(journalGameSchema.safeParse({ ...game, playedOn: '2026-02-30' }).success).toBe(false)
})

it('keeps blank text as no text', () => {
  expect(journalGameSchema.parse({ ...game, opponentName: '  ', notes: '' })).toMatchObject({ opponentName: null, notes: null })
})

it('totals nothing for an empty journal', () => {
  expect(journalTotals([])).toEqual({ games: 0, won: 0, drawn: 0, lost: 0, rate: 0, scored: 0, pointsFor: 0, pointsAgainst: 0 })
})

it('totals one game', () => {
  expect(journalTotals([{ result: 'won', score: 80, opponentScore: 60 }])).toEqual({
    games: 1,
    won: 1,
    drawn: 0,
    lost: 0,
    rate: 1,
    scored: 1,
    pointsFor: 80,
    pointsAgainst: 60,
  })
})

it('counts points only from games that recorded both scores', () => {
  expect(
    journalTotals([
      { result: 'won', score: 80, opponentScore: 60 },
      { result: 'drawn', score: null, opponentScore: null },
      { result: 'lost', score: 40, opponentScore: null },
    ]),
  ).toMatchObject({ games: 3, won: 1, drawn: 1, lost: 1, rate: 0.5, scored: 1, pointsFor: 80, pointsAgainst: 60 })
})

it('orders games by the day played, then the newest recorded', () => {
  expect(
    journalOrder([
      { id: 'a', playedOn: '2026-10-01', createdAt: 3 },
      { id: 'b', playedOn: '2026-10-03', createdAt: 1 },
      { id: 'c', playedOn: '2026-10-03', createdAt: 2 },
    ]).map((entry) => entry.id),
  ).toEqual(['c', 'b', 'a'])
})
