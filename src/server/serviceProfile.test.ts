import { expect, it, vi } from 'vitest'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'

function service(role: 'admin' | 'user', sponsorship: 'public' | 'private' | null) {
  const repository = {
    profileByUserId: vi.fn().mockResolvedValue({ id: 'player', name: 'Player', image: null }),
    githubSponsorship: vi.fn().mockResolvedValue(sponsorship),
    isAdmin: vi.fn().mockResolvedValue(role === 'admin'),
  } as unknown as RepositoryPort
  return new PraetoriumService(
    repository,
    () => 0,
    () => 0,
  )
}

it('shows both public supporter and admin status on an administrator profile', async () => {
  expect(await service('admin', 'public').userProfile('player')).toEqual({
    id: 'player',
    name: 'Player',
    image: null,
    supporter: true,
    admin: true,
  })
})

it('keeps a private sponsorship off an ordinary public profile', async () => {
  expect(await service('user', 'private').userProfile('player')).toMatchObject({ supporter: false, admin: false })
})
