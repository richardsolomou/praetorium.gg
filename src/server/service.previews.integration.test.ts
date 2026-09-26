import { describe, expect, it, vi } from 'vitest'
import type { RosterVisibility } from '../core/savedRoster'
import { playerPreview } from '../client/linkPreview'
import { Route as battleImage } from '../routes/api/previews.battles.$token'
import { Route as rosterImage } from '../routes/api/previews.rosters.$id'
import { Route as playerImage } from '../routes/api/previews.users.$userId'
import { service, started } from './serviceTestHarness'

vi.mock('./app', async () => {
  const harness = await import('./serviceTestHarness')
  return {
    app: () => ({
      service: harness.service,
      catalogueFor: async () => null,
      rulesFor: async () => null,
      factionIndexFor: async () => null,
    }),
  }
})

/** Calls an image route the way a crawler does: no session, only the address. */
async function fetchImage(route: { options: { server?: unknown } }, params: Record<string, string>) {
  const server = route.options.server as { handlers: { GET: (context: { params: Record<string, string> }) => Promise<Response> } }
  return server.handlers.GET({ params })
}

const answer = (response: Response) => [response.status, response.headers.get('content-type'), response.headers.get('cache-control')]

describe('a battle preview image', () => {
  it('shows a battle anyone may watch', async () => {
    const { token } = await started()
    expect(answer(await fetchImage(battleImage, { token }))).toEqual([200, 'image/png', 'public, max-age=60'])
  })

  it('holds a finished battle longer than a live one', async () => {
    const { token, send } = await started()
    await send('alice', { kind: 'end-battle' })
    expect((await fetchImage(battleImage, { token })).headers.get('cache-control')).toBe('public, max-age=600')
  })

  it.each(['private', 'friends'] as const)('shows nothing of a battle kept to %s', async (audience) => {
    await service.setBattleAudience('bob', audience)
    const { token } = await started()
    expect(answer(await fetchImage(battleImage, { token }))).toEqual([404, 'text/plain;charset=UTF-8', 'no-store'])
  })

  it('answers a link to no battle as not found', async () => {
    expect((await fetchImage(battleImage, { token: 'no-such-battle' })).status).toBe(404)
  })

  it('refuses an address no battle could have without reading for it', async () => {
    expect((await fetchImage(battleImage, { token: 'x'.repeat(65) })).status).toBe(404)
  })
})

describe('a roster preview image', () => {
  const saved = (visibility: RosterVisibility) =>
    service.saveRoster('alice', {
      name: 'Recon force',
      catalogueId: 'necrons',
      detachmentIds: [],
      disposition: null,
      limit: 2000,
      picks: [],
      prep: null,
      visibility,
      source: 'editable',
    })

  it.each(['public', 'unlisted'] as const)('shows a %s list to whoever holds its link', async (visibility) => {
    const { id } = await saved(visibility)
    expect(answer(await fetchImage(rosterImage, { id }))).toEqual([200, 'image/png', 'public, max-age=300'])
  })

  it('shows nothing of a private list', async () => {
    const { id } = await saved('private')
    expect((await fetchImage(rosterImage, { id })).status).toBe(404)
  })
})

describe('a player preview image', () => {
  it('shows any player, since a name is open to anybody', async () => {
    expect(answer(await fetchImage(playerImage, { userId: 'alice' }))).toEqual([200, 'image/png', 'public, max-age=300'])
  })

  it('answers a missing player as not found', async () => {
    expect((await fetchImage(playerImage, { userId: 'nobody' })).status).toBe(404)
  })

  it('keeps the record of a player who withholds their battles out of it', async () => {
    const { send } = await started()
    await send('alice', { kind: 'end-battle' })
    await service.setBattleAudience('alice', 'private')
    const { record } = await service.playerProfile('alice', null)
    expect(playerPreview('Alice', record, await service.playerRankings('alice')).card).toMatchObject({ record: null, rank: null })
  })

  it('reads the record of a player whose battles are public', async () => {
    const { send } = await started()
    await send('alice', { kind: 'end-battle' })
    const { record } = await service.playerProfile('alice', null)
    expect(playerPreview('Alice', record, null).card).toMatchObject({ record: '0 wins, 0 losses and 1 draw from 1 battle.' })
  })
})
