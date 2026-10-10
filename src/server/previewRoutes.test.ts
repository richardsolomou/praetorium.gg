import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route as battleImage } from '../routes/api/previews/battles.$token'
import { Route as rosterImage } from '../routes/api/previews/rosters.$id'
import { Route as playerImage } from '../routes/api/previews/users.$userId'
import { Route as datasheetImage } from '../routes/api/previews/datasheets.$catalogueId.$slug'
import { Route as detachmentImage } from '../routes/api/previews/detachments.$catalogueId.$slug'

const { service } = vi.hoisted(() => ({
  service: {
    screen: vi.fn(),
    rosterAccess: vi.fn(),
    userProfile: vi.fn(),
    playerProfile: vi.fn(),
    playerRankings: vi.fn(),
  },
}))

const loaded: { rules: object | null } = { rules: null }
const factions = { factions: [{ id: 'necrons-catalogue', slug: 'necrons', displayName: 'Necrons' }] }
const canonical = {
  datasheets: [{ catalogueId: 'necrons-catalogue', slug: 'warriors', name: 'Necron Warriors', points: 90, costs: [], baseSize: null }],
}
vi.mock('./app', () => ({
  app: () => ({
    service,
    rulesFor: async () => loaded.rules,
    catalogueFor: async () => ({}),
    factionIndexFor: async () => null,
    factionsFor: async () => factions,
    canonicalCatalogueFor: async () => canonical,
  }),
}))
vi.mock('../shared/detachmentReference', () => ({
  detachmentReference: (_catalogue: unknown, _rules: unknown, _catalogueId: string, slug: string) =>
    slug === 'awakened-dynasty' ? { name: 'Awakened Dynasty' } : null,
}))
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

beforeEach(() => {
  vi.resetAllMocks()
  loaded.rules = null
})

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

describe('reference preview images', () => {
  beforeEach(() => {
    loaded.rules = {}
  })

  it('draws a datasheet with its points', async () => {
    expect(await (await fetchImage(datasheetImage, { catalogueId: 'necrons', slug: 'warriors' })).json()).toMatchObject({
      card: { kind: 'reference', name: 'Necron Warriors', faction: 'Necrons', points: '90 pts' },
    })
  })

  it('does not draw a datasheet the faction does not have', async () => {
    expect((await fetchImage(datasheetImage, { catalogueId: 'necrons', slug: 'boyz' })).status).toBe(404)
  })

  it('does not draw a datasheet of a faction that does not exist', async () => {
    expect((await fetchImage(datasheetImage, { catalogueId: 'squats', slug: 'warriors' })).status).toBe(404)
  })

  it('draws a detachment under its faction', async () => {
    expect(await (await fetchImage(detachmentImage, { catalogueId: 'necrons', slug: 'awakened-dynasty' })).json()).toMatchObject({
      card: { kind: 'reference', label: 'Detachment', name: 'Awakened Dynasty', faction: 'Necrons' },
    })
  })

  it('does not draw a detachment the faction does not offer', async () => {
    expect((await fetchImage(detachmentImage, { catalogueId: 'necrons', slug: 'gladius' })).status).toBe(404)
  })
})
