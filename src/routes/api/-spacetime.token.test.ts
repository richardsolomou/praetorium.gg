import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Route } from './spacetime.token'

const { currentUser, spacetimeToken, userBattleId } = vi.hoisted(() => ({
  currentUser: vi.fn(),
  spacetimeToken: vi.fn(),
  userBattleId: vi.fn(),
}))
vi.mock('../../server/playerSession', () => ({ currentUser }))
vi.mock('../../server/app', () => ({ app: () => ({ spacetimeToken, service: { userBattleId } }) }))
beforeEach(() => {
  vi.stubEnv('SPACETIME_DATABASE', 'praetorium')
  vi.stubEnv('APP_URL', 'https://praetorium.gg')
  currentUser.mockReset().mockResolvedValue({ id: 'player-1' })
  spacetimeToken.mockReset().mockResolvedValue('access-token')
  userBattleId.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

async function token(search = '') {
  const handlers = Route.options.server?.handlers
  if (!handlers || typeof handlers === 'function' || typeof handlers.GET !== 'function') throw new Error('Missing token handler')
  const request = new Request(`https://praetorium.gg/api/spacetime/token${search}`)
  return (handlers.GET({ request } as never) as Promise<Response>).catch((thrown: unknown) => thrown)
}

it('issues no realtime token to a signed-out caller', async () => {
  currentUser.mockResolvedValue(null)
  expect(((await token()) as Response).status).toBe(401)
  expect(spacetimeToken).not.toHaveBeenCalled()
})

it('issues no realtime token for a battle the player is not seated in', async () => {
  userBattleId.mockRejectedValue(new Response('not seated', { status: 403 }))
  expect(((await token('?battle=private-battle')) as Response).status).toBe(403)
  expect(userBattleId).toHaveBeenCalledWith('private-battle', 'player-1')
  expect(spacetimeToken).not.toHaveBeenCalled()
})

it('issues a signed-in player a token with their seated battle', async () => {
  userBattleId.mockResolvedValue('battle-1')
  expect(await ((await token('?battle=seated-battle')) as Response).json()).toMatchObject({ token: 'access-token', battleId: 'battle-1' })
})
