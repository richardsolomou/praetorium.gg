import { expect, it, vi } from 'vitest'
import { ALICE, NAMES, log, started } from '../core/battle.fixtures'
import type { Command } from '../core/battle'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'

function fixture(sealedEvent: boolean, seated = true) {
  const history = {
    battle: { id: 'battle', token: 'token', createdAt: 0 },
    players: seated ? NAMES.map((player, side) => ({ ...player, side, automated: false })) : [],
    log: log(
      ...started(),
      ...(sealedEvent
        ? [[ALICE, { kind: 'lock-sealed-event-rosters', sealedEventToken: 'tournament', eventToken: 'event' }] as [string, Command]]
        : []),
    ),
  }
  const repository = {
    battleHistoryByToken: vi.fn().mockResolvedValue(history),
    battlesBySealedEvent: vi.fn().mockResolvedValue({ battles: [history], nextCursor: null }),
  } as unknown as RepositoryPort
  const service = new PraetoriumService(
    repository,
    () => 10,
    () => 0,
  )
  return { service, repository, history }
}

it.each([false, true])('allows an anonymous battle screen with sealed event linkage %s', async (sealedEvent) => {
  const { service } = fixture(sealedEvent)
  expect((await service.screen('token', null)).kind).toBe('spectator')
})

it('refuses a battle screen for a table nobody sits at', async () => {
  const { service } = fixture(false, false)
  expect(await service.screen('token', null)).toEqual({ kind: 'unavailable' })
})

it('retains a sealed event battle in an anonymous event feed', async () => {
  const { service } = fixture(true)
  expect((await service.sealedEventBattles('tournament', 'event', { limit: 25 })).battles.map((battle) => battle.token)).toEqual(['token'])
})

it('passes the event reader to the repository so access is filtered before pagination', async () => {
  const { service, repository } = fixture(true)
  await service.sealedEventBattles('tournament', 'event', { limit: 25 }, undefined, undefined, 'reader')
  expect(repository.battlesBySealedEvent).toHaveBeenCalledWith('tournament', 'event', { limit: 25, viewerId: 'reader' })
})

it('refuses the live watch read for a table nobody sits at', async () => {
  const { service } = fixture(false, false)
  expect(await service.liveBattle('token')).toBeNull()
})
