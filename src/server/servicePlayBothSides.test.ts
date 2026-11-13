import { expect, it, vi } from 'vitest'
import type { Command } from '../core/battle'
import { ALICE, log } from '../core/battle.fixtures'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'

const draft: Command = {
  kind: 'configure-battle',
  limit: null,
  missionPackId: null,
  terrainLayoutId: null,
  twistId: null,
  clockLimitMinutes: null,
  teamBattle: true,
  playerCount: 3,
  places: [2, 1],
}

/** Plays every side of a 2v1 draft its creator sits in alone, with `automated` accounts free to seat. */
async function seatedBy(automated: string[]) {
  const history = {
    battle: { id: 'battle', token: 'token', createdAt: 0 },
    players: [{ id: ALICE, name: 'Alice', side: 0, automated: false }],
    log: log([ALICE, draft]),
  }
  const seatBattlePlayer = vi.fn().mockResolvedValue('joined')
  const repository = {
    battleHistoryByToken: vi.fn().mockResolvedValue(history),
    practiceOpponentIds: vi.fn().mockResolvedValue(automated),
    seatBattlePlayer,
  } as unknown as RepositoryPort
  const service = new PraetoriumService(
    repository,
    () => 10,
    () => 0,
  )
  await service.playBothSides('token', ALICE)
  return seatBattlePlayer.mock.calls.map(([seat]) => [seat.userId, seat.side])
}

it('fills the ally place beside its creator as well as the place across the table', async () => {
  expect(await seatedBy(['first', 'second'])).toEqual([
    ['first', 0],
    ['second', 1],
  ])
})

it('refuses when there are too few accounts to fill every place', async () => {
  await expect(seatedBy(['first'])).rejects.toMatchObject({ status: 409 })
})
