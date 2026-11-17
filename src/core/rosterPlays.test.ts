import { expect, it } from 'vitest'
import type { BattleDigest, DigestSeat } from './battleDigest'
import { rosterPlayHistory } from './rosterPlays'

const seat = (id: string, side: number, score: number, army: string, rosterId?: string) =>
  ({ id, side, score, army, rosterId, copied: { catalogueId: 'necrons', detachmentIds: [] } }) as unknown as DigestSeat

const battle = (seats: DigestSeat[], status = 'finished', result: BattleDigest['result'] = null) => ({
  status: status as BattleDigest['status'],
  lastCommandAt: 1,
  result,
  seats,
})

const lists = [
  { id: 'a', name: 'Silent King', catalogueId: 'necrons' },
  { id: 'b', name: 'Silent King', catalogueId: 'necrons' },
  { id: 'c', name: 'Hypercrypt', catalogueId: 'necrons' },
]

it('counts an older battle for the one list with its name and army', () => {
  const [, , hypercrypt] = rosterPlayHistory('me', [battle([seat('me', 0, 80, 'Hypercrypt'), seat('them', 1, 60, 'Orks')])], lists)
  expect(hypercrypt!.plays).toMatchObject({ played: 1, won: 1 })
})

it('counts an older battle for no list when two share its name', () => {
  const plays = rosterPlayHistory('me', [battle([seat('me', 0, 80, 'Silent King'), seat('them', 1, 60, 'Orks')])], lists)
  expect(plays.every((list) => list.plays === null)).toBe(true)
})

it('does not count a battle that never finished', () => {
  const plays = rosterPlayHistory('me', [battle([seat('me', 0, 0, 'x', 'c'), seat('them', 1, 0, 'Orks')], 'active')], lists)
  expect(plays[2]!.plays).toBeNull()
})

it('counts a concession as a loss whatever the score', () => {
  const conceded = battle([seat('me', 0, 90, 'x', 'c'), seat('them', 1, 10, 'Orks')], 'finished', {
    concededBy: 'me',
  } as BattleDigest['result'])
  expect(rosterPlayHistory('me', [conceded], lists)[2]!.plays).toMatchObject({ played: 1, lost: 1 })
})
