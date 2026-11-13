import { expect, it, vi } from 'vitest'
import { battleCard } from './battleCard.fixtures'
import { ALICE, BOB, NAMES, builtRoster, log } from '../core/battle.fixtures'
import type { Command } from '../core/battle'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'

const fielded = (name: string): Command => {
  const command = builtRoster(name, ['Immortals']) as Extract<Command, { kind: 'attach-roster' }>
  return {
    ...command,
    roster: { ...command.roster, built: { ...command.roster.built!, picks: [{ entryId: 'immortals', note: 'Private plan' }] } },
  }
}

function fixture({ finished = true }: { finished?: boolean } = {}) {
  const history = {
    battle: { id: 'battle', token: 'token', createdAt: 0 },
    players: NAMES.map((player, side) => ({ ...player, side, automated: false })),
    log: log(
      [ALICE, fielded('Alice army')],
      [BOB, fielded('Bob army')],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
      ...(finished ? [[ALICE, { kind: 'end-battle', reason: 'conceded', concededBy: BOB }] as [string, Command]] : []),
    ),
  }
  const repository = {
    battleHistoryByToken: vi.fn().mockResolvedValue(history),
    publicBattles: vi.fn().mockResolvedValue({ battles: [battleCard(history)], nextCursor: null }),
  } as unknown as RepositoryPort
  return {
    service: new PraetoriumService(
      repository,
      () => 10,
      () => 0,
    ),
    repository,
  }
}

it('lists both armies of a finished public battle', async () => {
  const { service } = fixture()
  expect((await service.battleFeedService.playedArmies(null)).armies.map((army) => army.name)).toEqual(['Alice army', 'Bob army'])
})

it('reads armies only from the public feed, which leaves out the reader’s own battles', async () => {
  const { service, repository } = fixture()
  await service.battleFeedService.playedArmies('reader')
  expect(repository.publicBattles).toHaveBeenCalledWith(expect.objectContaining({ viewerId: 'reader' }))
})

it('gives a reader who may watch the battle the army to copy', async () => {
  const { service } = fixture()
  expect((await service.battleFeedService.playedArmy('token', BOB))?.name).toBe('Bob army')
})

it('refuses an army from a battle still being played', async () => {
  const { service } = fixture({ finished: false })
  expect(await service.battleFeedService.playedArmy('token', BOB)).toBeNull()
})

it('refuses an army from a deleted battle', async () => {
  const { service, repository } = fixture()
  vi.mocked(repository.battleHistoryByToken).mockResolvedValue(undefined)
  expect(await service.battleFeedService.playedArmy('token', BOB)).toBeNull()
})

it('says the army whose opponent conceded won', async () => {
  const { service } = fixture()
  expect((await service.battleFeedService.playedArmies(null)).armies[0]?.outcome.result).toBe('won')
})

it('names the opposing army’s faction from the catalogue', async () => {
  const { service } = fixture()
  const factions = [{ id: 'cat', slug: 'death-guard', displayName: 'Death Guard', icon: null }]
  expect(
    (await service.battleFeedService.playedArmies(null, undefined, factions)).armies[0]?.outcome.opponents.map(
      (faction) => faction.displayName,
    ),
  ).toEqual(['Death Guard'])
})

it('counts every public army except those of battles the reader sat in, which their feed leaves out', async () => {
  const { service } = fixture()
  expect(await service.battleFeedService.everyPlayedArmy(ALICE)).toEqual([])
})

it('counts every army of a public battle for a reader who did not sit in it', async () => {
  const { service } = fixture()
  expect((await service.battleFeedService.everyPlayedArmy('reader'))?.map((army) => army.name)).toEqual(['Alice army', 'Bob army'])
})
