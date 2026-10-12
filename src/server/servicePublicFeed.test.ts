import { expect, it, vi } from 'vitest'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'

function feed() {
  let now = 0
  const publicBattles = vi.fn().mockResolvedValue({ battles: [], nextCursor: null })
  const service = new PraetoriumService(
    { publicBattles } as unknown as RepositoryPort,
    () => now,
    () => 0,
  )
  return { service, publicBattles, advance: (ms: number) => (now += ms) }
}

it('serves a burst of reads of one feed page from one database read', async () => {
  const { service, publicBattles } = feed()
  await Promise.all([service.publicBattles(null), service.publicBattles(null), service.publicBattles(null)])
  expect(publicBattles).toHaveBeenCalledTimes(1)
})

it('reads the feed again once the held page is five seconds old', async () => {
  const { service, publicBattles, advance } = feed()
  await service.publicBattles(null)
  advance(5_000)
  await service.publicBattles(null)
  expect(publicBattles).toHaveBeenCalledTimes(2)
})

it('keeps each reader’s feed apart, since a reader’s own battles are left out of it', async () => {
  const { service, publicBattles } = feed()
  await service.publicBattles('player-1')
  await service.publicBattles('player-2')
  expect(publicBattles.mock.calls.map(([query]) => query.viewerId)).toEqual(['player-1', 'player-2'])
})

it('reads again after a failed read', async () => {
  const { service, publicBattles } = feed()
  publicBattles.mockRejectedValueOnce(new Error('unavailable'))
  await expect(service.publicBattles(null)).rejects.toThrow('unavailable')
  await expect(service.publicBattles(null)).resolves.toEqual({ battles: [], nextCursor: null })
})
