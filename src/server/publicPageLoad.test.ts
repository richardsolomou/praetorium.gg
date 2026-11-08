import { createHmac } from 'node:crypto'
import { expect, it } from 'vitest'
import { publicPageLoad, signedSessionCookie } from './publicPageLoad'

const SECRET = 'praetorium-public-page-load-test-secret'
const reader = (cookie: string) => new Request('https://praetorium.gg/factions/necrons', { headers: { cookie } })
/** Signed the way Better Auth sets the cookie: the token, a dot, its base64 HMAC-SHA256, URI-encoded. */
const sessionCookie = (token: string, secret: string) =>
  `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${createHmac('sha256', secret).update(token).digest('base64')}`)}`

const pending = () => {
  let finish!: () => void
  const done = new Promise<string>((resolve, reject) => (finish = () => reject(new Error('render failed'))))
  done.catch(() => {})
  return { render: () => done, finish }
}

it('turns a render away while the limit is in flight', async () => {
  const load = publicPageLoad(1)
  void load(pending().render).catch(() => {})
  const response = await load(async () => 'page')
  expect(response instanceof Response && response.status).toBe(503)
})

it('takes renders again once a failed one has let go of its slot', async () => {
  const load = publicPageLoad(1)
  const first = pending()
  const running = load(first.render)
  first.finish()
  await expect(running).rejects.toThrow('render failed')
  expect(await load(async () => 'page')).toBe('page')
})

it.each([
  ['a made-up cookie', 'better-auth.session_token=x.y'],
  ['a cookie signed with another secret', sessionCookie('session-token', 'another-secret')],
])('counts %s as signed out', async (_name, cookie) => {
  expect(await signedSessionCookie(reader(cookie), SECRET)).toBe(false)
})

it('counts a cookie Better Auth signed as a session', async () => {
  expect(await signedSessionCookie(reader(`ph=1; ${sessionCookie('session-token', SECRET)}`), SECRET)).toBe(true)
})
