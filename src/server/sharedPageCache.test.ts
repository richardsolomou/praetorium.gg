import { expect, it } from 'vitest'
import { SHARED_PAGE_CACHE, sharedPageCache } from './sharedPageCache'

const page = (headers: Record<string, string> = {}, status = 200) =>
  new Response('<!doctype html>', { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers } })
const read = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
  new Request(`https://praetorium.gg${path}`, { method, headers })

it.each([
  ['a signed-out faction page', read('/factions/necrons')],
  ['a signed-out head request', read('/rules', {}, 'HEAD')],
  ['a reader with only analytics cookies', read('/missions', { cookie: 'ph_phc_key_posthog=1' })],
])('lets Cloudflare share %s', (_name, request) => {
  expect(sharedPageCache(request, page())).toBe(SHARED_PAGE_CACHE)
})

it.each([
  ['a signed-in reader', read('/factions/necrons', { cookie: 'ph=1; __Secure-better-auth.session_token=abc' }), page()],
  ['a signed-in reader on plain HTTP', read('/factions/necrons', { cookie: 'better-auth.session_token=abc' }), page()],
  ['a bearer-token reader', read('/factions/necrons', { authorization: 'Bearer token' }), page()],
  ['a submitted form', read('/factions/necrons', {}, 'POST'), page()],
  ['a missing page', read('/factions/unknown'), page({}, 404)],
  ['a non-HTML answer', read('/factions/necrons'), new Response('{}', { headers: { 'Content-Type': 'application/json' } })],
  ['a page that sets a cookie', read('/factions/necrons'), page({ 'Set-Cookie': 'a=1' })],
  ['a page with its own cache policy', read('/factions/necrons'), page({ 'Cache-Control': 'no-store' })],
  ['a player page', read('/battles'), page()],
  ['the roster library, which reads guest cookies', read('/rosters'), page()],
])('keeps %s out of the shared cache', (_name, request, response) => {
  expect(sharedPageCache(request, response)).toBeNull()
})
