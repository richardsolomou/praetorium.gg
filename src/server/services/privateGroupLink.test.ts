import { expect, it, vi } from 'vitest'
import type { RepositoryPort } from '../spacetimeRepository'
import { SealedEventService } from './sealedEventService'

/** A private group's hidden-list game, as a reader reaches it from a public battle: by the game's token alone. */
function address(viewerId: string | null, named = 'game') {
  const repository = {
    eventAddress: vi.fn().mockResolvedValue({ kind: 'hidden-list-game', groupToken: 'invite', token: 'game' }),
    groupByToken: vi.fn().mockResolvedValue({ visibility: 'private', members: [{ userId: 'member', status: 'accepted' }] }),
  }
  return new SealedEventService(repository as Partial<RepositoryPort> as RepositoryPort, () => 1, { notify: vi.fn() }).eventAddress(
    named,
    viewerId,
    'game',
  )
}

it('keeps a private group’s invite link from a reader who named only its game', async () => {
  expect([await address(null), await address('stranger')]).toEqual([null, null])
})

it('names a private group to its members and to whoever already holds its link', async () => {
  const named = expect.objectContaining({ groupToken: 'invite' })
  expect([await address('member'), await address(null, 'invite')]).toEqual([named, named])
})
