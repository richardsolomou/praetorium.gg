import { describe, expect, it } from 'vitest'
import { PLAYER_COOKIE, playerIdFrom, signPlayerId, verifyPlayerCookie } from './identity'

const SECRET = 'test-secret'

describe('a guest cookie', () => {
  it('names the player who was issued it', () => {
    expect(verifyPlayerCookie(signPlayerId('abc', SECRET), SECRET)).toBe('abc')
  })

  it('is refused when the id is edited to claim someone else', () => {
    const [, signature] = signPlayerId('abc', SECRET).split('.')
    expect(verifyPlayerCookie(`xyz.${signature}`, SECRET)).toBeNull()
  })

  it('is refused when signed with another instance’s secret', () => {
    expect(verifyPlayerCookie(signPlayerId('abc', 'other-secret'), SECRET)).toBeNull()
  })

  it('is read out of the request’s own cookie header', () => {
    const headers = new Headers({ cookie: `theme=dark; ${PLAYER_COOKIE}=${signPlayerId('abc', SECRET)}` })
    expect(playerIdFrom(headers, SECRET)).toBe('abc')
  })
})
