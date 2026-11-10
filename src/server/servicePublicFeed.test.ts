import { describe, expect, it, vi } from 'vitest'
import { battleCard } from './battleCard.fixtures'
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

describe('a filtered feed', () => {
  const history = (id: string, at: number) => battleCard({ battle: { id, token: id, createdAt: at }, at, players: [], log: [] })
  const walking = (pages: { battles: ReturnType<typeof history>[]; nextCursor: { at: number; id: string } | null }[]) => {
    const publicBattles = vi.fn()
    for (const page of pages) publicBattles.mockResolvedValueOnce(page)
    publicBattles.mockImplementation(async ({ before }: { before?: { at: number } }) => ({
      battles: [],
      nextCursor: { at: (before?.at ?? 1_000) - 1, id: 'older' },
    }))
    const service = new PraetoriumService(
      { publicBattles } as unknown as RepositoryPort,
      () => 1_000,
      () => 0,
    )
    return { service, publicBattles }
  }
  const nobody = { q: 'no such player' }

  it('walks on when a page holds no match', async () => {
    const { service, publicBattles } = walking([
      { battles: [history('a', 900)], nextCursor: { at: 900, id: 'a' } },
      { battles: [], nextCursor: null },
    ])
    await service.publicBattles(null, null, { filter: nobody })
    expect(publicBattles).toHaveBeenCalledTimes(2)
  })

  it('stops at its limit and leaves a cursor to continue from', async () => {
    const { service, publicBattles } = walking([])
    const page = await service.publicBattles(null, null, { filter: nobody })
    expect([publicBattles.mock.calls.length, page.nextCursor]).toEqual([6, { at: 994, id: 'older' }])
  })

  it('starts a bounded period at its end instead of walking down to it', async () => {
    const { service, publicBattles } = walking([{ battles: [], nextCursor: null }])
    await service.publicBattles(null, null, { filter: { to: '1970-01-01' } })
    expect(publicBattles.mock.calls[0]![0].before).toEqual({ at: 86_400_000, id: '' })
  })

  it('starts oldest first at the beginning of a period', async () => {
    const { service, publicBattles } = walking([{ battles: [], nextCursor: null }])
    await service.publicBattles(null, null, { filter: { from: '1970-01-02' }, order: 'oldest' })
    expect(publicBattles.mock.calls[0]![0]).toMatchObject({ before: { at: 86_400_000, id: '' }, order: 'oldest' })
  })

  it('stops oldest first once the walk passes the end of a period', async () => {
    const { service, publicBattles } = walking([{ battles: [], nextCursor: { at: 86_400_000, id: 'later' } }])
    await service.publicBattles(null, null, { filter: { to: '1970-01-01' }, order: 'oldest' })
    expect(publicBattles).toHaveBeenCalledTimes(1)
  })
})
