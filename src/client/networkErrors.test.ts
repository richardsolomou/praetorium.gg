import { expect, it } from 'vitest'
import {
  HttpStatusError,
  isFetchNetworkFailure,
  isModuleLoadFailure,
  SERVER_UNANSWERED_MESSAGE,
  serverFunctionFetch,
} from './networkErrors'

it.each([
  new TypeError('Failed to fetch'),
  new TypeError('NetworkError when attempting to fetch resource.'),
  new TypeError('Load failed'),
  new TypeError('fetch failed'),
])('treats %s as a network failure', (error) => {
  expect(isFetchNetworkFailure(error)).toBe(true)
})

it.each([
  new Error('Failed to fetch'),
  new TypeError('Failed to fetch dynamically imported module: https://praetorium.gg/assets/a.js'),
  new TypeError('x is not a function'),
  'Failed to fetch',
  null,
])('reports %s as an application failure', (error) => {
  expect(isFetchNetworkFailure(error)).toBe(false)
})

it.each([
  new TypeError('Failed to fetch dynamically imported module: https://praetorium.gg/assets/a.js'),
  new TypeError('error loading dynamically imported module: https://praetorium.gg/assets/a.js'),
  new TypeError('Importing a module script failed.'),
])('treats %s as a failed chunk load', (error) => {
  expect(isModuleLoadFailure(error)).toBe(true)
})

it('does not treat a dropped fetch as a failed chunk load', () => {
  expect(isModuleLoadFailure(new TypeError('Failed to fetch'))).toBe(false)
})

const answering = (response: Response) => serverFunctionFetch('/_serverFn/x', {}, () => Promise.resolve(response))

it("says Praetorium didn't answer instead of quoting a proxy's error page", async () => {
  const page = new Response('<html><body>502 Bad Gateway</body></html>', { status: 502, headers: { 'content-type': 'text/html' } })
  await expect(answering(page)).rejects.toThrow(SERVER_UNANSWERED_MESSAGE)
})

it('keeps the status of an answer that is not the service', async () => {
  await expect(answering(new Response(null, { status: 503 }))).rejects.toBeInstanceOf(HttpStatusError)
})

it('passes on the error a server function sent', async () => {
  const sent = new Response('{}', { status: 500, headers: { 'content-type': 'application/json', 'x-tss-serialized': 'true' } })
  await expect(answering(sent)).resolves.toBe(sent)
})
