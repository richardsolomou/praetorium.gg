import { expect, it, vi } from 'vitest'
import { ALICE, BOB, NAMES, log, started } from '../core/battle.fixtures'
import type { Command } from '../core/battle'
import type { BattleAudience } from '../core/battleAudience'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'

function fixture(audience: BattleAudience, league: boolean) {
  const history = {
    battle: { id: 'battle', token: 'token', createdAt: 0 },
    players: NAMES.map((player, side) => ({ ...player, side, automated: false })),
    log: log(
      ...started(),
      ...(league ? [[ALICE, { kind: 'lock-league-rosters', leagueToken: 'league', eventToken: 'event' }] as [string, Command]] : []),
    ),
  }
  const repository = {
    battleHistoryByToken: vi.fn().mockResolvedValue(history),
    battleAudiences: vi.fn().mockResolvedValue(
      new Map([
        [ALICE, audience],
        [BOB, 'public'],
      ]),
    ),
    relationships: vi.fn().mockResolvedValue([]),
    battlesByLeagueEvent: vi.fn().mockResolvedValue({ battles: [history], nextCursor: null }),
  } as unknown as RepositoryPort
  const service = new PraetoriumService(
    repository,
    () => 10,
    () => 0,
  )
  return { service, repository, history }
}

it.each([false, true])('refuses an anonymous private battle screen with league linkage %s', async (league) => {
  const { service } = fixture('private', league)
  expect(await service.screen('token', null)).toEqual({ kind: 'unavailable' })
})

it.each([false, true])('refuses an anonymous friends battle replay with league linkage %s', async (league) => {
  const { service } = fixture('friends', league)
  expect(await service.replayAt('token', null, 1)).toEqual({ kind: 'unavailable' })
})

it.each([false, true])('allows an anonymous public battle screen with league linkage %s', async (league) => {
  const { service } = fixture('public', league)
  expect((await service.screen('token', null)).kind).toBe('spectator')
})

it('keeps a private league battle visible to a seated player', async () => {
  const { service } = fixture('private', true)
  expect((await service.screen('token', BOB)).kind).toBe('battle')
})

it('omits a private league battle from an anonymous event feed', async () => {
  const { service } = fixture('private', true)
  expect((await service.leagueBattles('league', 'event', { limit: 25 })).battles).toEqual([])
})

it('retains a public league battle in an anonymous event feed', async () => {
  const { service } = fixture('public', true)
  expect((await service.leagueBattles('league', 'event', { limit: 25 })).battles.map((battle) => battle.token)).toEqual(['token'])
})

it.each([null, 1])('allows only accepted friendships to watch a friends-only league battle with acceptance %s', async (acceptedAt) => {
  const { service, repository } = fixture('friends', true)
  vi.mocked(repository.relationships).mockResolvedValue([
    { requesterId: 'viewer', addresseeId: BOB, acceptedAt, otherId: BOB, otherName: 'Bob', otherImage: null },
  ])
  expect((await service.screen('token', 'viewer')).kind).toBe(acceptedAt === null ? 'unavailable' : 'spectator')
})

it('refuses a signed-in stranger a friends-only league battle', async () => {
  const { service } = fixture('friends', true)
  expect((await service.screen('token', 'stranger')).kind).toBe('unavailable')
})

it('keeps a private league battle in its opponent’s event feed', async () => {
  const { service } = fixture('private', true)
  expect(
    (await service.leagueBattles('league', 'event', { limit: 25 }, undefined, undefined, BOB)).battles.map((battle) => battle.token),
  ).toEqual(['token'])
})

it('passes the event reader to the repository so access is filtered before pagination', async () => {
  const { service, repository } = fixture('private', true)
  await service.leagueBattles('league', 'event', { limit: 25 }, undefined, undefined, BOB)
  expect(repository.battlesByLeagueEvent).toHaveBeenCalledWith('league', 'event', { limit: 25, viewerId: BOB })
})
