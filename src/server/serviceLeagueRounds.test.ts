import { expect, it, vi } from 'vitest'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'

async function pairRound(result: string) {
  const notify = vi.fn()
  const repository = { pairLeagueRound: vi.fn().mockResolvedValue(result) } as unknown as RepositoryPort
  const service = new PraetoriumService(
    repository,
    () => 0,
    () => 0,
    { notify },
  )
  vi.spyOn(service.leagueService, 'league').mockResolvedValue({
    eventToken: 'event',
    rounds: 3,
    revealedAt: 1,
    pairings: [],
    entries: ['organizer', 'bob', 'carol'].map((userId) => ({ userId, status: 'accepted', submitted: true })),
  } as never)
  vi.spyOn(service, 'leagueBattles').mockResolvedValue({ battles: [], nextCursor: null })
  await service.pairLeagueRound('league', 'event', 'organizer').catch(() => {})
  return notify
}

it('tells every seated player, the bye included, that the round is paired', async () => {
  expect((await pairRound('paired')).mock.calls[0]?.[0]).toEqual([
    {
      kind: 'league-round-paired',
      actorId: 'organizer',
      recipientIds: ['organizer', 'bob', 'carol'],
      leagueToken: 'league',
      eventToken: 'event',
      round: 1,
    },
  ])
})

it.each(['not-ready', 'stale'])('tells nobody when pairing is %s', async (result) => {
  expect((await pairRound(result)).mock.calls).toEqual([])
})
