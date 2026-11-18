import { expect, it } from 'vitest'
import { rosterPlayHistory, type PlayedBattle } from './rosterPlays'

const played = (
  seats: { id: string; side: number; score: number; rosterId?: string; name?: string }[],
  extra: Partial<PlayedBattle> = {},
) =>
  ({
    lastActivity: 1,
    playerIds: seats.map((seat) => seat.id),
    sides: seats.map((seat) => seat.side),
    scores: seats.map((seat) => seat.score),
    result: null,
    built: seats.map(() => ({ catalogueId: 'necrons' })),
    rosterIds: seats.map((seat) => seat.rosterId ?? null),
    rosterNames: seats.map((seat) => seat.name ?? null),
    ...extra,
  }) satisfies PlayedBattle

const lists = [
  { id: 'a', name: 'Silent King', catalogueId: 'necrons' },
  { id: 'b', name: 'Silent King', catalogueId: 'necrons' },
  { id: 'c', name: 'Hypercrypt', catalogueId: 'necrons' },
]
const them = { id: 'them', side: 1, score: 60 }

it('counts an older battle for the one list with its name and army', () => {
  const [, , hypercrypt] = rosterPlayHistory('me', [played([{ id: 'me', side: 0, score: 80, name: 'Hypercrypt' }, them])], lists)
  expect(hypercrypt!.plays).toMatchObject({ played: 1, won: 1 })
})

it('counts an older battle for no list when two share its name', () => {
  const plays = rosterPlayHistory('me', [played([{ id: 'me', side: 0, score: 80, name: 'Silent King' }, them])], lists)
  expect(plays.every((list) => list.plays === null)).toBe(true)
})

it('counts a concession as a loss whatever the score', () => {
  const conceded = played([{ id: 'me', side: 0, score: 90, rosterId: 'c' }, them], { result: { concededBy: 'me' } })
  expect(rosterPlayHistory('me', [conceded], lists)[2]!.plays).toMatchObject({ played: 1, lost: 1 })
})

it('counts a sealed list for the saved list its entry came from, not another of its name', () => {
  const sealed = played([{ id: 'me', side: 0, score: 80, name: 'Hypercrypt' }, them], { eventToken: 'event' })
  const plays = rosterPlayHistory('me', [sealed], lists, new Map([['event', 'a']]))
  expect(plays.map((list) => list.plays?.played ?? 0)).toEqual([1, 0, 0])
})
