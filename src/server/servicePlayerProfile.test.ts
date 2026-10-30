import { expect, it, vi } from 'vitest'
import { ALICE, NAMES, log, roster, started } from '../core/battle.fixtures'
import { guestSeatId } from '../core/newBattle'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'

it('shows a player’s battles in their profile to an anonymous reader', async () => {
  const history = {
    battle: { id: 'battle', token: 'token', createdAt: 0 },
    players: NAMES.map((player, side) => ({ ...player, side, automated: false })),
    log: log(...started(), [ALICE, { kind: 'end-battle', reason: 'conceded', concededBy: ALICE }]),
  }
  const repository = {
    battlesSeatedBy: vi.fn().mockResolvedValue([history]),
    claimStandingsRefresh: vi.fn().mockResolvedValue({ state: 'fresh', standings: '1' }),
    ratingChanges: vi.fn().mockResolvedValue([]),
    profilesByIds: vi.fn().mockResolvedValue(new Map()),
    practiceOpponents: vi.fn().mockResolvedValue([]),
  } as unknown as RepositoryPort
  const service = new PraetoriumService(
    repository,
    () => 10,
    () => 0,
  )
  expect((await service.playerProfile(ALICE, null)).played).toBe(1)
})

it('shows how far the leaderboard says each profile battle moved each player’s rating', async () => {
  const history = {
    battle: { id: 'battle', token: 'token', createdAt: 0 },
    players: NAMES.map((player, side) => ({ ...player, side, automated: false })),
    log: log(...started(), [ALICE, { kind: 'end-battle', reason: 'conceded', concededBy: ALICE }]),
  }
  const repository = {
    battlesSeatedBy: vi.fn().mockResolvedValue([history]),
    claimStandingsRefresh: vi.fn().mockResolvedValue({ state: 'fresh', standings: '1' }),
    ratingChanges: vi.fn().mockResolvedValue([{ token: 'token', changes: { [ALICE]: -12, bob: 12 } }]),
    profilesByIds: vi.fn().mockResolvedValue(new Map()),
    practiceOpponents: vi.fn().mockResolvedValue([]),
  } as unknown as RepositoryPort
  const service = new PraetoriumService(
    repository,
    () => 10,
    () => 0,
  )
  const [battle] = (await service.playerProfile(ALICE, null)).battles

  expect(battle?.ratingChanges).toEqual({ [ALICE]: -12, bob: 12 })
})

function recordAgainst(opponent: { id: string; name: string }, practiceIds: string[]) {
  const history = {
    battle: { id: 'battle', token: 'token', createdAt: 0 },
    players: [
      { id: ALICE, name: 'Alice', image: null, side: 0, automated: false },
      { ...opponent, image: null, side: 1, automated: true },
    ],
    log: log(
      [ALICE, roster('Ultramarines')],
      [ALICE, { kind: 'attach-roster', playerId: opponent.id, roster: { name: 'Death Guard', text: '10 Plague Marines' } }],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
      [ALICE, { kind: 'end-battle', reason: 'conceded', concededBy: opponent.id }],
    ),
  }
  const repository = {
    battlesSeatedBy: vi.fn().mockResolvedValue([history]),
    claimStandingsRefresh: vi.fn().mockResolvedValue({ state: 'fresh', standings: '1' }),
    ratingChanges: vi.fn().mockResolvedValue([]),
    profilesByIds: vi.fn().mockResolvedValue(new Map()),
    practiceOpponents: vi.fn().mockResolvedValue(practiceIds.map((id) => ({ id, name: 'Practice Opponent', image: null }))),
  } as unknown as RepositoryPort
  const service = new PraetoriumService(
    repository,
    () => 10,
    () => 0,
  )
  return service.playerProfile(ALICE, null)
}

it('counts a battle against a guest in the host’s record', async () => {
  expect((await recordAgainst({ id: guestSeatId('battle', 0), name: 'Alex' }, [])).record.battles).toBe(1)
})

it('leaves a battle against a practice opponent out of the record', async () => {
  expect((await recordAgainst({ id: 'practice', name: 'Practice Opponent' }, ['practice'])).record.battles).toBe(0)
})

it('shows a player’s performance over time to an anonymous reader', async () => {
  expect((await recordAgainst({ id: guestSeatId('battle', 0), name: 'Alex' }, [])).performance).not.toBeNull()
})
