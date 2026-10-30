import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './spacetime.token'

const { currentUserId, heldGuestSeat, spacetimeGuestToken, spacetimeToken, userBattleId } = vi.hoisted(() => ({
  currentUserId: vi.fn(),
  heldGuestSeat: vi.fn(),
  spacetimeGuestToken: vi.fn(),
  spacetimeToken: vi.fn(),
  userBattleId: vi.fn(),
}))
vi.mock('../../server/playerSession', () => ({ currentUserId }))
vi.mock('../../server/guestSession', () => ({ heldGuestSeat }))
vi.mock('../../server/app', () => ({ app: () => ({ spacetimeToken, spacetimeGuestToken, service: { userBattleId } }) }))
beforeEach(() => {
  vi.stubEnv('SPACETIME_DATABASE', 'praetorium')
  vi.stubEnv('APP_URL', 'https://praetorium.gg')
  currentUserId.mockReset().mockResolvedValue('player-1')
  heldGuestSeat.mockReset().mockResolvedValue(null)
  spacetimeGuestToken.mockReset().mockResolvedValue('guest-token')
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
  currentUserId.mockResolvedValue(null)
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

describe('a guest seat’s device', () => {
  const held = { token: 'guest-battle', seat: 'guest:battle-2:0', secret: 'device-secret' }
  beforeEach(() => {
    currentUserId.mockResolvedValue(null)
    heldGuestSeat.mockImplementation(async (battle: string) => (battle === held.token ? held : null))
    userBattleId.mockResolvedValue('battle-2')
  })

  it('gets a token for the seat it holds in that battle', async () => {
    expect(await ((await token('?battle=guest-battle')) as Response).json()).toMatchObject({ token: 'guest-token', battleId: 'battle-2' })
  })

  it('gets a token naming its seat and the hash of its secret', async () => {
    await token('?battle=guest-battle')
    expect(spacetimeGuestToken).toHaveBeenCalledWith(held.seat, createHash('sha256').update(held.secret).digest('hex'))
  })

  it('opens the battle as its seat', async () => {
    await token('?battle=guest-battle')
    expect(userBattleId).toHaveBeenCalledWith('guest-battle', held.seat)
  })

  it('gets no token for a battle it holds no seat in', async () => {
    expect(((await token('?battle=another-battle')) as Response).status).toBe(401)
    expect(spacetimeGuestToken).not.toHaveBeenCalled()
  })

  it('gets no token without naming its battle', async () => {
    expect(((await token()) as Response).status).toBe(401)
    expect(spacetimeGuestToken).not.toHaveBeenCalled()
  })
})
