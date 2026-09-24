import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SIGN_IN_REQUIRED } from '../core/session'
import type { PraetoriumConnection } from '../db/connection'
import { Repository } from '../db/repository'
import { pushTokens } from '../db/schema'
import { openTestDatabase } from '../db/testDatabase'
import { createAuth } from './auth'
import { PraetoriumService } from './service'

const { instance } = vi.hoisted(() => {
  const current: { current: unknown } = { current: null }
  return { instance: current }
})
vi.mock('./app', () => ({ app: () => instance.current }))

const { registerPushDeviceRequest, unregisterPushDeviceRequest } = await import('./pushDevices')

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef'
const ORIGIN = 'http://localhost'
const SERVER_FUNCTION = `${ORIGIN}/_serverFn/registerPushDevice`
const DEVICE = { token: 'ExponentPushToken[webview-device]', platform: 'ios' as const }

let connection: PraetoriumConnection
let auth: ReturnType<typeof createAuth>
let cookie: string
let administrator: Headers

/** The cookie a browser holds after these responses, a later cookie of the same name replacing an earlier one. */
function cookieOf(...responses: Headers[]) {
  const jar = new Map<string, string>()
  for (const pair of responses.flatMap((headers) => headers.getSetCookie().map((value) => value.split(';')[0] ?? ''))) {
    const [name, value] = pair.split(/=(.*)/s)
    if (name && value !== undefined) jar.set(name, value)
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ')
}

/** What a WKWebView `fetch` sends: its stored cookie, and an Origin only when the test gives one. */
function webViewHeaders(origin: string | null, sessionCookie = cookie) {
  const headers = new Headers({ cookie: sessionCookie, 'content-type': 'application/json', 'user-agent': 'PraetoriumNative/1.3.0' })
  if (origin !== null) headers.set('origin', origin)
  return headers
}

const stored = async () => (await connection.database.select({ token: pushTokens.token }).from(pushTokens)).map((row) => row.token)

beforeEach(async () => {
  connection = await openTestDatabase()
  auth = createAuth(connection.database, SECRET)
  instance.current = { auth, service: new PraetoriumService(new Repository(connection.database), Date.now, { publish: () => {} }, () => 0) }
  const signedUp = await auth.api.signUpEmail({
    body: { email: 'native@example.com', password: 'password1234', name: 'Native' },
    returnHeaders: true,
  })
  administrator = signedUp.headers
  cookie = cookieOf(signedUp.headers)
})

afterEach(() => connection.close())

describe('push device registration from the WebView', () => {
  it('registers the device for the signed-in account', async () => {
    await registerPushDeviceRequest(new Request(SERVER_FUNCTION, { method: 'POST', headers: webViewHeaders(ORIGIN) }), DEVICE)

    expect(await stored()).toEqual([DEVICE.token])
  })

  it('refuses a request whose cookie belongs to a session that has ended', async () => {
    const stale = cookie
    await auth.api.signOut({ headers: new Headers({ cookie }) })

    await expect(
      registerPushDeviceRequest(new Request(SERVER_FUNCTION, { method: 'POST', headers: webViewHeaders(ORIGIN, stale) }), DEVICE),
    ).rejects.toThrow(SIGN_IN_REQUIRED)
    expect(await stored()).toEqual([])
  })

  it('refuses a request without an Origin header', async () => {
    await expect(
      registerPushDeviceRequest(new Request(SERVER_FUNCTION, { method: 'POST', headers: webViewHeaders(null) }), DEVICE),
    ).rejects.toThrow('cross-origin mutation rejected')
    expect(await stored()).toEqual([])
  })

  it('refuses a request whose Origin is null', async () => {
    await expect(
      registerPushDeviceRequest(new Request(SERVER_FUNCTION, { method: 'POST', headers: webViewHeaders('null') }), DEVICE),
    ).rejects.toThrow('cross-origin mutation rejected')
    expect(await stored()).toEqual([])
  })

  it('refuses a request from another origin', async () => {
    await expect(
      registerPushDeviceRequest(new Request(SERVER_FUNCTION, { method: 'POST', headers: webViewHeaders('https://example.com') }), DEVICE),
    ).rejects.toThrow('cross-origin mutation rejected')
    expect(await stored()).toEqual([])
  })

  it('accepts a request supplied by another server runtime', async () => {
    const foreign = { url: SERVER_FUNCTION, method: 'POST', headers: webViewHeaders(ORIGIN) } as Request

    await registerPushDeviceRequest(foreign, DEVICE)

    expect(await stored()).toEqual([DEVICE.token])
  })

  it('refuses to register an administrator’s device while impersonating a player', async () => {
    const player = await auth.api.signUpEmail({ body: { email: 'player@example.com', password: 'password1234', name: 'Player' } })
    const impersonating = await auth.api.impersonateUser({
      body: { userId: player.user.id },
      headers: new Headers({ cookie }),
      returnHeaders: true,
    })

    await expect(
      registerPushDeviceRequest(
        new Request(SERVER_FUNCTION, { method: 'POST', headers: webViewHeaders(ORIGIN, cookieOf(administrator, impersonating.headers)) }),
        DEVICE,
      ),
    ).rejects.toThrow('stop impersonating')
    expect(await stored()).toEqual([])
  })

  it('forgets the device on sign-out from the same WebView', async () => {
    await registerPushDeviceRequest(new Request(SERVER_FUNCTION, { method: 'POST', headers: webViewHeaders(ORIGIN) }), DEVICE)

    await unregisterPushDeviceRequest(new Request(SERVER_FUNCTION, { method: 'POST', headers: webViewHeaders(ORIGIN) }), DEVICE.token)

    expect(await stored()).toEqual([])
  })
})
