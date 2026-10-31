import { expect, it, vi } from 'vitest'
import { ALICE, BOB } from '../core/battle.fixtures'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'

it('refuses to pair a round from a partial read of the event’s battles', async () => {
  const repository = {
    sealedEventByToken: vi.fn().mockResolvedValue({
      organizerIds: [ALICE],
      eventToken: 'event',
      rounds: 3,
      revealedAt: 1,
      pairings: [],
      entries: [ALICE, BOB].map((userId) => ({ userId, status: 'accepted', submitted: true })),
    }),
    battlesBySealedEvent: vi.fn().mockResolvedValue({ battles: [], nextCursor: { at: 0, id: 'older' } }),
    practiceOpponents: vi.fn().mockResolvedValue([]),
    pairSealedEventRound: vi.fn().mockResolvedValue('paired'),
  } as unknown as RepositoryPort
  const service = new PraetoriumService(
    repository,
    () => 10,
    () => 0,
  )
  await expect(service.pairSealedEventRound('tournament', 'event', ALICE)).rejects.toMatchObject({ status: 409 })
})
