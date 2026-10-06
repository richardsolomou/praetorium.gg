import { expect, it, vi } from 'vitest'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'

it.each([undefined, null, 1000])('creates the initial format command atomically for preset %s', async (limit) => {
  const createBattle = vi.fn()
  const repository = {
    namesByIds: vi.fn().mockResolvedValue(new Map([['opponent', 'Opponent']])),
    relationships: vi.fn().mockResolvedValue([]),
    practiceOpponents: vi.fn().mockResolvedValue([{ id: 'opponent', name: 'Opponent', image: null }]),
    createBattle,
  } as unknown as RepositoryPort
  const service = new PraetoriumService(
    repository,
    () => 0,
    () => 0,
  )
  await service.createBattle('actor', { opponentId: 'opponent', limit, missionPackId: null, casual: true })
  expect(createBattle.mock.calls[0]?.[0]?.initialCommand).toEqual({
    kind: 'configure-battle',
    limit: limit ?? null,
    missionPackId: null,
    terrainLayoutId: null,
    twistId: null,
    teamBattle: false,
    playerCount: 2,
    clockLimitMinutes: null,
  })
})
