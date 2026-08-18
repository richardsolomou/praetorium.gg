import { jwtVerify } from 'jose'
import { describe, expect, it } from 'vitest'
import { connectionToken, subscriptionToken } from './realtime'

const secret = 'test-realtime-secret'
const key = new TextEncoder().encode(secret)
const verification = { currentDate: new Date(100_000) }

describe('realtime adapter', () => {
  it('signs connection identity with a short expiry', async () => {
    const { payload, protectedHeader } = await jwtVerify(await connectionToken('player-1', secret, 100), key, verification)

    expect({ payload, protectedHeader }).toEqual({
      payload: { sub: 'player-1', exp: 400 },
      protectedHeader: { alg: 'HS256', typ: 'JWT' },
    })
  })

  it('signs channel access and presence information', async () => {
    const token = await subscriptionToken({ id: 'player-1', name: 'Alice' }, 'battle:one', secret, 100)
    const { payload } = await jwtVerify(token, key, verification)

    expect(payload).toEqual({
      sub: 'player-1',
      channel: 'battle:one',
      exp: 400,
      info: { playerId: 'player-1', name: 'Alice' },
    })
  })

  it('rejects a different signing secret', async () => {
    const token = await connectionToken('player-1', secret, 100)

    await expect(jwtVerify(token, new TextEncoder().encode('wrong-secret'))).rejects.toThrow('signature verification failed')
  })
})
