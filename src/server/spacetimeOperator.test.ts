import { expect, it, vi } from 'vitest'
import { SpacetimeOperator } from './spacetimeOperator'

it('sends a session revocation to the selected database with the operator credential', async () => {
  const request = vi.fn(async () => new Response(null, { status: 200 }))
  const operator = new SpacetimeOperator('https://spacetime.example/', 'preview-42', 'operator-secret', request)
  await operator.revokeSession('session-1')
  const [url, init] = request.mock.calls[0] as unknown as [URL, RequestInit]
  expect(url.toString()).toBe('https://spacetime.example/v1/database/preview-42/call/revoke_session')
  expect(init).toMatchObject({ method: 'POST', body: '["session-1"]', redirect: 'error' })
  expect(new Headers(init.headers).get('authorization')).toBe('Bearer operator-secret')
})

it('sends both Access and operator credentials to the protected database', async () => {
  const request = vi.fn(async () => Response.json(true))
  const operator = new SpacetimeOperator('https://spacetime.example/', 'preview-42', 'operator-secret', request, {
    clientId: 'access-id',
    clientSecret: 'access-secret',
  })
  await operator.health()
  const headers = new Headers((request.mock.calls[0] as unknown as [URL, RequestInit])[1].headers)
  expect([headers.get('authorization'), headers.get('CF-Access-Client-Id'), headers.get('CF-Access-Client-Secret')]).toEqual([
    'Bearer operator-secret',
    'access-id',
    'access-secret',
  ])
})

it('does not send an operator credential to a non-local HTTP origin', () => {
  expect(() => new SpacetimeOperator('http://spacetime.example/', 'preview-42', 'operator-secret')).toThrow('Invalid SpacetimeDB URL')
})

it('fails a session revocation when SpacetimeDB refuses it', async () => {
  const operator = new SpacetimeOperator(
    'https://spacetime.example/',
    'preview-42',
    'operator-secret',
    async () => new Response(null, { status: 403 }),
  )
  await expect(operator.revokeSession('session-1')).rejects.toThrow('HTTP 403')
})

it('sends account deletion to the selected database', async () => {
  const request = vi.fn(async () => new Response(null, { status: 200 }))
  const operator = new SpacetimeOperator('https://spacetime.example/', 'preview-42', 'operator-secret', request)
  await operator.deleteUserData('user-1')
  const [url, init] = request.mock.calls[0] as unknown as [URL, RequestInit]
  expect(url.pathname).toBe('/v1/database/preview-42/call/delete_user_data')
  expect(init.body).toBe('["user-1"]')
})
