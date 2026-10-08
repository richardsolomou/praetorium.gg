import { describe, expect, it, vi } from 'vitest'
import type { Command } from '../core/battle'
import { SpacetimeOperator } from './spacetimeOperator'

it('sends a session revocation to the selected database with the operator credential', async () => {
  const request = vi.fn(async () => new Response(null, { status: 200 }))
  const operator = new SpacetimeOperator('https://spacetime.example/', 'preview-42', 'operator-secret', request)
  await operator.revokeSession('session-1')
  const [url, init] = request.mock.calls[0] as unknown as [URL, RequestInit]
  expect(url.toString()).toBe('https://spacetime.example/v1/database/preview-42/call/revoke_session')
  expect(init).toMatchObject({ method: 'POST', body: '["session-1"]', redirect: 'manual' })
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

it('permits only the configured internal Docker host over HTTP', () => {
  const operator = new SpacetimeOperator(
    'http://spacetimedb-staging:3000/',
    'preview-42',
    'operator-secret',
    fetch,
    undefined,
    'spacetimedb-staging',
  )
  expect(operator).toBeInstanceOf(SpacetimeOperator)
  expect(
    () => new SpacetimeOperator('http://other-service:3000/', 'preview-42', 'operator-secret', fetch, undefined, 'spacetimedb-staging'),
  ).toThrow('Invalid SpacetimeDB URL')
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

it('reads a bounded home roster page through the operator procedure', async () => {
  const request = vi.fn(async () => Response.json(JSON.stringify({ count: 0, rows: [] })))
  const operator = new SpacetimeOperator('https://spacetime.example/', 'preview-42', 'operator-secret', request)
  expect(await operator.homeRostersByUser('user-1')).toEqual({ count: 0, rows: [] })
  const [url, init] = request.mock.calls[0] as unknown as [URL, RequestInit]
  expect(url.pathname).toBe('/v1/database/preview-42/call/home_rosters_by_user')
  expect(init.body).toBe('["user-1"]')
})

it('reads compact roster summaries without requiring picks or preparation data', async () => {
  const summary = {
    id: 'roster-1',
    name: 'Army',
    automaticName: true,
    catalogueId: 'faction',
    detachmentId: '[]',
    disposition: null,
    limit: 2000,
    waivedRules: '[]',
    optionalRules: '[]',
    borrowedDetachmentId: null,
    baseRosterId: 'roster-0',
    visibility: 'private',
    source: 'editable',
    createdAt: 1,
    updatedAt: 2,
    unitCount: 2,
  }
  const request = vi.fn(async () => Response.json(JSON.stringify([summary])))
  const operator = new SpacetimeOperator('https://spacetime.example/', 'preview-42', 'operator-secret', request)
  expect(await operator.rosterSummariesByUser('user-1')).toEqual([summary])
  const [url, init] = request.mock.calls[0] as unknown as [URL, RequestInit]
  expect([url.pathname, init.body]).toEqual(['/v1/database/preview-42/call/roster_summaries_by_user', '["user-1"]'])
})

it('reads only the requested roster ids for an owner', async () => {
  const request = vi.fn(async () => Response.json(JSON.stringify([])))
  const operator = new SpacetimeOperator('https://spacetime.example/', 'preview-42', 'operator-secret', request)
  expect(await operator.rostersByIds('user-1', ['first', 'second'])).toEqual([])
  const [url, init] = request.mock.calls[0] as unknown as [URL, RequestInit]
  expect([url.pathname, init.body]).toEqual(['/v1/database/preview-42/call/rosters_by_ids', '["user-1",["first","second"]]'])
})

describe('battle submission refusals', () => {
  const snapshot = {
    battle: { id: 'battle-1', token: 'token-1', createdAt: 0 },
    seats: [
      { id: 'alice', side: 0, automated: false },
      { id: 'bob', side: 1, automated: false },
    ],
    log: [],
  }
  const product = (reason: string) => {
    const request = vi.fn(async (url: URL | RequestInfo, _init?: RequestInit) =>
      Response.json(
        JSON.stringify(
          (url as URL).pathname.endsWith('/battle_for_operator') ? snapshot : { result: { outcome: 'refused', reason }, log: snapshot.log },
        ),
      ),
    )
    return { request, operator: new SpacetimeOperator('https://spacetime.example/', 'preview-42', 'operator-secret', request) }
  }
  const input = (command: Command) => ({ battleId: 'battle-1', userId: 'alice', expectedSeq: 0, command, now: 0 })

  it('codes a domain refusal from the log the product database refused it against', async () => {
    const { operator } = product('the battle is not running')
    expect((await operator.submit(input({ kind: 'advance' }))).result).toEqual({
      outcome: 'refused',
      code: 'battle-not-running',
      reason: 'the battle is not running',
    })
  })

  it('sends a rules refusal message to the product database and keeps its code', async () => {
    const { operator, request } = product('choose a deployment')
    const { result } = await operator.submit(input({ kind: 'set-setup-step', step: 1 }), () => ({
      code: 'missing-deployment',
      message: 'choose a deployment',
    }))
    const [, init] = request.mock.calls[1] as unknown as [URL, RequestInit]
    expect([JSON.parse(init.body as string).at(-1), result]).toEqual([
      'choose a deployment',
      { outcome: 'refused', code: 'missing-deployment', reason: 'choose a deployment' },
    ])
  })

  it('marks a refusal this release cannot reproduce as unclassified', async () => {
    const { operator } = product('a rule from another release')
    expect((await operator.submit(input({ kind: 'set-setup-step', step: 1 }))).result).toEqual({
      outcome: 'refused',
      code: 'unclassified',
      reason: 'a rule from another release',
    })
  })
})
