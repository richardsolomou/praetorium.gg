import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { drizzle } from 'drizzle-orm/d1'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPlatformProxy, type PlatformProxy } from 'wrangler'
import { SIGN_IN_REQUIRED } from '../core/session'
import { createD1Auth } from './d1Auth'

const { instance } = vi.hoisted(() => {
  const current: { current: unknown } = { current: null }
  return { instance: current }
})
vi.mock('./app', () => ({ app: () => instance.current }))

const { registerPushDeviceRequest, unregisterPushDeviceRequest } = await import('./pushDevices')

const ORIGIN = 'http://localhost'
const SERVER_FUNCTION = `${ORIGIN}/_serverFn/registerPushDevice`
const DEVICE = { token: 'ExponentPushToken[webview-device]', platform: 'ios' as const }

let directory: string
let proxy: PlatformProxy<{ AUTH_DB: Parameters<typeof drizzle>[0] }>
let auth: ReturnType<typeof createD1Auth>
let cookie: string
let administrator: Headers
let devices: Map<string, string>

function cookieOf(...responses: Headers[]) {
  const jar = new Map<string, string>()
  for (const pair of responses.flatMap((headers) => headers.getSetCookie().map((value) => value.split(';')[0] ?? ''))) {
    const [name, value] = pair.split(/=(.*)/s)
    if (name && value !== undefined) jar.set(name, value)
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ')
}

function webViewHeaders(origin: string | null, sessionCookie = cookie) {
  const headers = new Headers({ cookie: sessionCookie, 'content-type': 'application/json', 'user-agent': 'PraetoriumNative/1.3.0' })
  if (origin !== null) headers.set('origin', origin)
  return headers
}

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'praetorium-push-devices-'))
  const configPath = path.join(directory, 'wrangler.jsonc')
  await writeFile(
    configPath,
    JSON.stringify({
      name: 'praetorium-push-devices-test',
      main: 'index.js',
      compatibility_date: '2026-09-17',
      d1_databases: [{ binding: 'AUTH_DB', database_name: 'praetorium-push-devices-test', database_id: randomUUID() }],
    }),
  )
  proxy = await getPlatformProxy<{ AUTH_DB: Parameters<typeof drizzle>[0] }>({ configPath, persist: false, envFiles: [] })
  const migration = await readFile(path.resolve('drizzle-auth/0000_curly_gambit.sql'), 'utf8')
  for (const statement of migration.split('--> statement-breakpoint')) {
    if (statement.trim()) await proxy.env.AUTH_DB.prepare(statement).run()
  }
  auth = createD1Auth(proxy.env.AUTH_DB, 'praetorium-push-device-test-secret', {
    environment: { APP_URL: ORIGIN, AUTH_RATE_LIMIT: 'off', SPACETIME_AUDIENCE: 'praetorium-push-device-test' },
    deleteUserData: async () => {},
    revokeSessionAccess: async () => {},
    storeSocialAvatar: async () => null,
    updateProfile: async (data) => ({ ok: true, data }),
  })
  administrator = (
    await auth.api.signUpEmail({
      body: { email: `admin-${randomUUID()}@example.com`, password: 'password1234', name: 'Admin' },
      returnHeaders: true,
    })
  ).headers
})

afterAll(async () => {
  await proxy?.dispose()
  if (directory) await rm(directory, { recursive: true, force: true })
})

beforeEach(async () => {
  devices = new Map()
  instance.current = {
    auth,
    service: {
      registerPushDevice: async (userId: string, device: typeof DEVICE) => {
        devices.set(device.token, userId)
      },
      unregisterPushDevice: async (userId: string, token: string) => {
        if (devices.get(token) === userId) devices.delete(token)
      },
    },
  }
  const signedUp = await auth.api.signUpEmail({
    body: { email: `native-${randomUUID()}@example.com`, password: 'password1234', name: 'Native' },
    returnHeaders: true,
  })
  cookie = cookieOf(signedUp.headers)
})

describe('push device registration from the WebView', () => {
  it('registers the device for the signed-in account', async () => {
    await registerPushDeviceRequest(new Request(SERVER_FUNCTION, { method: 'POST', headers: webViewHeaders(ORIGIN) }), DEVICE)
    expect([...devices.keys()]).toEqual([DEVICE.token])
  })

  it('refuses a request whose cookie belongs to a session that has ended', async () => {
    const stale = cookie
    await auth.api.signOut({ headers: new Headers({ cookie }) })
    await expect(
      registerPushDeviceRequest(new Request(SERVER_FUNCTION, { method: 'POST', headers: webViewHeaders(ORIGIN, stale) }), DEVICE),
    ).rejects.toThrow(SIGN_IN_REQUIRED)
    expect(devices.size).toBe(0)
  })

  it.each([null, 'null', 'https://example.com'])('refuses an invalid Origin %s', async (origin) => {
    await expect(
      registerPushDeviceRequest(new Request(SERVER_FUNCTION, { method: 'POST', headers: webViewHeaders(origin) }), DEVICE),
    ).rejects.toThrow('cross-origin mutation rejected')
    expect(devices.size).toBe(0)
  })

  it('accepts a request supplied by another server runtime', async () => {
    const foreign = { url: SERVER_FUNCTION, method: 'POST', headers: webViewHeaders(ORIGIN) } as Request
    await registerPushDeviceRequest(foreign, DEVICE)
    expect([...devices.keys()]).toEqual([DEVICE.token])
  })

  it('refuses to register an administrator’s device while impersonating a player', async () => {
    const player = await auth.api.signUpEmail({
      body: { email: `player-${randomUUID()}@example.com`, password: 'password1234', name: 'Player' },
    })
    const impersonating = await auth.api.impersonateUser({
      body: { userId: player.user.id },
      headers: new Headers({ cookie: cookieOf(administrator) }),
      returnHeaders: true,
    })
    await expect(
      registerPushDeviceRequest(
        new Request(SERVER_FUNCTION, { method: 'POST', headers: webViewHeaders(ORIGIN, cookieOf(administrator, impersonating.headers)) }),
        DEVICE,
      ),
    ).rejects.toThrow('stop impersonating')
    expect(devices.size).toBe(0)
  })

  it('forgets the device on sign-out from the same WebView', async () => {
    await registerPushDeviceRequest(new Request(SERVER_FUNCTION, { method: 'POST', headers: webViewHeaders(ORIGIN) }), DEVICE)
    await unregisterPushDeviceRequest(new Request(SERVER_FUNCTION, { method: 'POST', headers: webViewHeaders(ORIGIN) }), DEVICE.token)
    expect(devices.size).toBe(0)
  })
})
