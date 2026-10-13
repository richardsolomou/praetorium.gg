import { expect, it, vi } from 'vitest'
import { ALICE, BOB, NAMES, log, started } from '../core/battle.fixtures'
import type { BattleAudience } from '../core/battleAudience'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'

const FRIEND = 'friend'

function profileOf(audience: BattleAudience, viewerId: string | null) {
  const history = {
    battle: { id: 'battle', token: 'token', createdAt: 0 },
    players: NAMES.map((player, side) => ({ ...player, side, automated: false })),
    log: log(...started(), [ALICE, { kind: 'end-battle', reason: 'conceded', concededBy: ALICE }]),
  }
  const repository = {
    battlesSeatedBy: vi.fn().mockResolvedValue([history]),
    practiceOpponents: vi.fn().mockResolvedValue([]),
    battleAudiences: vi.fn().mockResolvedValue(
      new Map([
        [ALICE, audience],
        [BOB, 'public'],
      ]),
    ),
    relationships: vi
      .fn()
      .mockResolvedValue(
        viewerId === FRIEND
          ? [{ requesterId: ALICE, addresseeId: FRIEND, acceptedAt: 1, otherId: ALICE, otherName: 'Alice', otherImage: null }]
          : [],
      ),
  } as unknown as RepositoryPort
  const service = new PraetoriumService(
    repository,
    () => 10,
    () => 0,
  )
  return service.playerProfile(ALICE, viewerId)
}

it('shows a friends-only battle in a player’s profile to their friend', async () => {
  expect((await profileOf('friends', FRIEND)).played).toBe(1)
})

it('leaves a friends-only battle out of a player’s profile for a signed-in stranger', async () => {
  expect((await profileOf('friends', 'stranger')).played).toBe(0)
})

it('leaves a friends-only battle out of a player’s profile for an anonymous reader', async () => {
  expect((await profileOf('friends', null)).played).toBe(0)
})

it('leaves a players-only battle out of a player’s profile for their friend', async () => {
  expect((await profileOf('private', FRIEND)).played).toBe(0)
})

it('keeps a players-only battle in a player’s profile for the opponent who sat at it', async () => {
  expect((await profileOf('private', BOB)).played).toBe(1)
})

it('shows a public battle in a player’s profile to an anonymous reader', async () => {
  expect((await profileOf('public', null)).played).toBe(1)
})
