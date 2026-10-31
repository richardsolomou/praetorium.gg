import { expect, it, vi } from 'vitest'
import { ALICE, BOB, NAMES, builtRoster, log } from '../core/battle.fixtures'
import type { Command } from '../core/battle'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'

const lock = (sealedEventToken: string, eventToken?: string): Command => ({
  kind: 'lock-league-rosters',
  leagueToken: sealedEventToken,
  eventToken,
})
const tagged: Command = { kind: 'set-battle-club', clubId: 'group-id' }

function fixture({ members = [ALICE, BOB], visibility = 'private', counted = tagged, finished = true } = {}) {
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
  const repository = {
    groupByToken: vi.fn().mockResolvedValue({
      id: 'group-id',
      token: 'group',
      ownerId: ALICE,
      visibility,
      games: [{ token: 'game' }],
      members: members.map((userId) => ({ userId, status: 'accepted', role: 'member', name: userId, image: null })),
    }),
    battlesByGroup: vi.fn().mockResolvedValue({ battles: [history], nextCursor: null }),
    practiceOpponents: vi.fn().mockResolvedValue([]),
  } as unknown as RepositoryPort
  return new PraetoriumService(
    repository,
    () => 10,
    () => 0,
  )
}

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
  expect(await rows(fixture({ counted: { kind: 'set-battle-club', clubId: 'another-group' } }))).toEqual([])
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
