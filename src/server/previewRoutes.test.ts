import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route as battleImage } from '../routes/api/previews.battles.$token'
import { Route as rosterImage } from '../routes/api/previews.rosters.$id'
import { Route as playerImage } from '../routes/api/previews.users.$userId'

const { service } = vi.hoisted(() => ({
  service: {
    screen: vi.fn(),
    rosterAccess: vi.fn(),
    userProfile: vi.fn(),
    playerProfile: vi.fn(),
    playerRankings: vi.fn(),
  },
}))

vi.mock('./app', () => ({ app: () => ({ service, rulesFor: async () => null, factionIndexFor: async () => null }) }))
vi.mock('./rosterPrices', () => ({ cachedRosterPrice: async () => null }))
vi.mock('./previewImage', () => ({
  previewResponse: async (load: () => Promise<unknown>) => {
    const found = await load()
    return found ? Response.json(found) : new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  },
}))

async function fetchImage(route: { options: { server?: unknown } }, params: Record<string, string>) {
  const server = route.options.server as { handlers: { GET: (context: { params: Record<string, string> }) => Promise<Response> } }
  return server.handlers.GET({ params })
}

beforeEach(() => vi.resetAllMocks())

describe('crawler preview access', () => {
  it('reads a battle as a signed-out spectator', async () => {
    service.screen.mockResolvedValue(null)
    await fetchImage(battleImage, { token: 'public-battle' })
    expect(service.screen).toHaveBeenCalledWith('public-battle', null, null)
  })

  it('does not reveal a battle without a spectator view', async () => {
    service.screen.mockResolvedValue({ kind: 'player' })
    expect((await fetchImage(battleImage, { token: 'private-battle' })).status).toBe(404)
  })

  it('does not read an invalid battle token', async () => {
    expect((await fetchImage(battleImage, { token: 'x'.repeat(65) })).status).toBe(404)
    expect(service.screen).not.toHaveBeenCalled()
  })

  it('reads a roster as an unauthenticated visitor', async () => {
    service.rosterAccess.mockResolvedValue(null)
    await fetchImage(rosterImage, { id: 'public-roster' })
    expect(service.rosterAccess).toHaveBeenCalledWith('public-roster', null, null)
  })

  it('does not reveal a roster without visitor access', async () => {
    service.rosterAccess.mockResolvedValue(null)
    expect((await fetchImage(rosterImage, { id: 'private-roster' })).status).toBe(404)
  })

  it('does not reveal a missing player', async () => {
    service.userProfile.mockResolvedValue(null)
    expect((await fetchImage(playerImage, { userId: 'missing-player' })).status).toBe(404)
  })
})
