import { expect, it, vi } from 'vitest'
import { battleCard } from './battleCard.fixtures'
import { ALICE, BOB, NAMES, builtRoster, log } from '../core/battle.fixtures'
import type { Command } from '../core/battle'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'

const lock = (sealedEventToken: string, eventToken?: string): Command => ({
  kind: 'lock-sealed-event-rosters',
  sealedEventToken,
  eventToken,
})
const tagged: Command = { kind: 'set-battle-group', groupId: 'group-id' }

function repositoryFor({ members = [ALICE, BOB], visibility = 'private', counted = tagged, finished = true } = {}) {
  const history = {
    battle: { id: 'battle', token: 'token', createdAt: 0 },
    players: NAMES.map((player, side) => ({ ...player, side, automated: false })),
    log: log(
      [ALICE, builtRoster('Alice army', ['Immortals'])],
      [BOB, builtRoster('Bob army', ['Immortals'])],
      [ALICE, counted],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
      ...(finished ? [[ALICE, { kind: 'end-battle', reason: 'conceded', concededBy: BOB }] as [string, Command]] : []),
    ),
  }
  return {
    groupByToken: vi.fn().mockResolvedValue(groupRecord(members, visibility, '1:1')),
    battlesByGroup: vi.fn().mockResolvedValue({ battles: [battleCard(history)], nextCursor: null }),
    practiceOpponents: vi.fn().mockResolvedValue([]),
    profilesByIds: vi.fn().mockResolvedValue(new Map()),
  }
}

function groupRecord(members: string[], visibility: string, battlesRevision: string) {
  return {
    id: 'group-id',
    token: 'group',
    ownerId: ALICE,
    visibility,
    games: [{ token: 'game' }],
    members: members.map((userId) => ({ userId, status: 'accepted', role: 'member', name: userId, image: null })),
    battlesRevision,
  }
}

const serviceOf = (repository: ReturnType<typeof repositoryFor>) =>
  new PraetoriumService(
    repository as unknown as RepositoryPort,
    () => 10,
    () => 0,
  )

const fixture = (options?: Parameters<typeof repositoryFor>[0]) => serviceOf(repositoryFor(options))

const rows = async (service: PraetoriumService, viewerId: string | null = ALICE) =>
  (await service.groupStandings('group', viewerId))?.table.rows.map((row) => row.id)

it('rates the battles chosen for the group', async () => {
  expect(await rows(fixture())).toEqual([ALICE, BOB])
})

it('counts the battles of the group’s games', async () => {
  expect(await rows(fixture({ counted: lock('game', 'game') }))).toEqual([ALICE, BOB])
})

it('counts a battle of the sealed event the group once was, which names no event', async () => {
  expect(await rows(fixture({ counted: lock('group') }))).toEqual([ALICE, BOB])
})

it('leaves out a battle of another event', async () => {
  expect(await rows(fixture({ counted: lock('group', 'elsewhere') }))).toEqual([])
})

it('leaves a player who left the group off its table', async () => {
  expect(await rows(fixture({ members: [ALICE] }))).toEqual([ALICE])
})

it('counts only battles whose log still names the group', async () => {
  expect(await rows(fixture({ counted: { kind: 'set-battle-group', groupId: 'another-group' } }))).toEqual([])
})

it('shows a battle played since the table was last read', async () => {
  const repository = repositoryFor()
  const service = serviceOf(repository)
  repository.battlesByGroup.mockResolvedValueOnce({ battles: [], nextCursor: null })
  await rows(service)
  repository.groupByToken.mockResolvedValue(groupRecord([ALICE, BOB], 'private', '1:2'))
  expect(await rows(service)).toEqual([ALICE, BOB])
})

it('drops a player who leaves while the group’s battles are unchanged', async () => {
  const repository = repositoryFor()
  const service = serviceOf(repository)
  await rows(service)
  repository.groupByToken.mockResolvedValue(groupRecord([ALICE], 'private', '1:1'))
  expect(await rows(service)).toEqual([ALICE])
})

it('names a player who renamed while the group’s battles are unchanged', async () => {
  const repository = repositoryFor()
  const service = serviceOf(repository)
  await rows(service)
  repository.profilesByIds.mockResolvedValue(new Map([[ALICE, { id: ALICE, name: 'Alicia', image: null }]]))
  expect((await service.groupStandings('group', ALICE))?.table.rows[0]?.name).toBe('Alicia')
})

it('hides a private group’s table from a non-member', async () => {
  expect(await fixture().groupStandings('group', 'stranger')).toBeNull()
})

it('shows a public group’s table to anyone', async () => {
  expect(await rows(fixture({ visibility: 'public' }), null)).toEqual([ALICE, BOB])
})

it('lists a hidden-list game’s battle among the recent ones, named by its game', async () => {
  expect((await fixture({ counted: lock('game', 'game') }).groupStandings('group', ALICE))?.games).toEqual({ token: 'game' })
})

it('keeps a hidden-list game current while one of its battles is still being played', async () => {
  expect((await fixture({ counted: lock('game', 'game'), finished: false }).groupStandings('group', ALICE))?.playing).toEqual(['game'])
})

const listed = async (service: PraetoriumService, viewerId: string | null = ALICE) =>
  (await service.groupBattles('group', viewerId, {})).battles.map((battle) => battle.token)

it('lists the battles of the group’s games with the game each came from', async () => {
  expect((await fixture({ counted: lock('game', 'game') }).groupBattles('group', ALICE, {})).games).toEqual({ token: 'game' })
})

it('leaves a battle of another group out of the group’s list', async () => {
  expect(await listed(fixture({ counted: { kind: 'set-battle-group', groupId: 'another-group' } }))).toEqual([])
})

it('hides a private group’s battles from a non-member', async () => {
  expect(await listed(fixture(), 'stranger')).toEqual([])
})
