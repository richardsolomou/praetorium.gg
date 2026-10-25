import { expect, it, vi } from 'vitest'
import { ALICE, BOB, NAMES, builtRoster, log } from '../core/battle.fixtures'
import type { Command } from '../core/battle'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'

function fixture({ members = [ALICE, BOB], visibility = 'private', clubId = 'club-id', tagged = true } = {}) {
  const history = {
    battle: { id: 'battle', token: 'token', createdAt: 0 },
    players: NAMES.map((player, side) => ({ ...player, side, automated: false })),
    log: log(
      [ALICE, builtRoster('Alice army', ['Immortals'])],
      [BOB, builtRoster('Bob army', ['Immortals'])],
      [ALICE, tagged ? { kind: 'set-battle-club', clubId } : { kind: 'lock-league-rosters', leagueToken: 'league', eventToken: 'event' }],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
      [ALICE, { kind: 'end-battle', reason: 'conceded', concededBy: BOB }] as [string, Command],
    ),
  }
  const repository = {
    clubByToken: vi.fn().mockResolvedValue({
      id: 'club-id',
      token: 'club',
      ownerId: ALICE,
      visibility,
      tournaments: [{ token: 'league', eventTokens: ['event'] }],
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

it('counts the battles of the club’s tournaments', async () => {
  expect(await rows(fixture({ tagged: false }))).toEqual([ALICE, BOB])
})

it('leaves a player who left the club off its table', async () => {
  expect(await rows(fixture({ members: [ALICE] }))).toEqual([ALICE])
})

it('counts only battles whose log still names the club', async () => {
  expect(await rows(fixture({ clubId: 'another-club' }))).toEqual([])
})

it('hides a private club’s table from a non-member', async () => {
  expect(await fixture().clubStandings('club', 'stranger')).toBeNull()
})

it('shows a public club’s table to anyone', async () => {
  expect(await rows(fixture({ visibility: 'public' }), null)).toEqual([ALICE, BOB])
})
