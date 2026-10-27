import { expect, it, vi } from 'vitest'
import { ALICE, BOB, NAMES, builtRoster, log } from '../core/battle.fixtures'
import type { Command } from '../core/battle'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'

const lock = (leagueToken: string, eventToken?: string): Command => ({ kind: 'lock-league-rosters', leagueToken, eventToken })
const tagged: Command = { kind: 'set-battle-club', clubId: 'club-id' }

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
    clubByToken: vi.fn().mockResolvedValue({
      id: 'club-id',
      token: 'club',
      ownerId: ALICE,
      visibility,
      games: [{ token: 'game' }],
      members: members.map((userId) => ({ userId, status: 'accepted', role: 'member', name: userId, image: null })),
    }),
    battlesByClub: vi.fn().mockResolvedValue({ battles: [history], nextCursor: null }),
    practiceOpponents: vi.fn().mockResolvedValue([]),
  } as unknown as RepositoryPort
  return new PraetoriumService(
    repository,
    () => 10,
    () => 0,
  )
}

const rows = async (service: PraetoriumService, viewerId: string | null = ALICE) =>
  (await service.clubStandings('club', viewerId))?.table.rows.map((row) => row.id)

it('rates the battles chosen for the club', async () => {
  expect(await rows(fixture())).toEqual([ALICE, BOB])
})

it('counts the battles of the club’s games', async () => {
  expect(await rows(fixture({ counted: lock('game', 'game') }))).toEqual([ALICE, BOB])
})

it('counts a battle of the league the club once was, which names no event', async () => {
  expect(await rows(fixture({ counted: lock('club') }))).toEqual([ALICE, BOB])
})

it('leaves out a battle of another event', async () => {
  expect(await rows(fixture({ counted: lock('club', 'elsewhere') }))).toEqual([])
})

it('leaves a player who left the club off its table', async () => {
  expect(await rows(fixture({ members: [ALICE] }))).toEqual([ALICE])
})

it('counts only battles whose log still names the club', async () => {
  expect(await rows(fixture({ counted: { kind: 'set-battle-club', clubId: 'another-club' } }))).toEqual([])
})

it('hides a private club’s table from a non-member', async () => {
  expect(await fixture().clubStandings('club', 'stranger')).toBeNull()
})

it('shows a public club’s table to anyone', async () => {
  expect(await rows(fixture({ visibility: 'public' }), null)).toEqual([ALICE, BOB])
})

it('lists a sealed game’s battle among the recent ones, named by its game', async () => {
  expect((await fixture({ counted: lock('game', 'game') }).clubStandings('club', ALICE))?.games).toEqual({ token: 'game' })
})

it('keeps a sealed game current while one of its battles is still being played', async () => {
  expect((await fixture({ counted: lock('game', 'game'), finished: false }).clubStandings('club', ALICE))?.playing).toEqual(['game'])
})
