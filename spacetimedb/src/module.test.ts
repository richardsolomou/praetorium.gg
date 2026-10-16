import { ConnectionId, Timestamp } from 'spacetimedb'
import { createModuleTestHarness, TestAuth, TestClock } from 'spacetimedb/server/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The test host stubs environment reads, so the module reads these instead.
const env = vi.hoisted((): Record<string, string> => ({}))
vi.mock('spacetime:sys@2.2', async (original) => ({ ...(await original<object>()), env_get: (key: string) => env[key] ?? null }))

import spacetime, * as module from './index'

const ISSUER = 'https://praetorium.gg/api/auth'
const AUDIENCE = 'praetorium'
const NOW = 1_800_000_000
const seconds = (time: number) => new Timestamp(BigInt(time) * 1_000_000n)

let connection = 0n
const signed = (payload: Record<string, unknown>) => TestAuth.fromJwtPayload(JSON.stringify(payload), new ConnectionId(++connection))
const player = (subject: string, payload: Record<string, unknown> = {}) =>
  signed({
    iss: ISSUER,
    sub: subject,
    aud: [AUDIENCE],
    userId: `user-of-${subject}`,
    accessExpiresAt: NOW + 300,
    exp: NOW + 300,
    tokenType: 'spacetime-access',
    ...payload,
  })
const stranger = () => signed({ iss: 'https://elsewhere.example', sub: 'stranger', aud: ['spacetimedb'] })

function harness() {
  const operator = signed({ iss: 'https://spacetime.example', sub: 'operator', aud: ['spacetimedb'] })
  const test = createModuleTestHarness(spacetime, module, { clock: new TestClock(seconds(NOW)) })
  Object.assign(env, {
    AUTH_ISSUER: ISSUER,
    AUTH_AUDIENCE: AUDIENCE,
    OPERATOR_IDENTITY: test.withReducerTx(operator, (ctx) => ctx.sender.toHexString()),
  })
  test.withReducerTx(TestAuth.internal(), (ctx) => module.init(ctx, {}))
  const at = (time: number) => test.clock.set(seconds(time))
  const call = <T>(auth: TestAuth, body: Parameters<typeof test.withReducerTx<T>>[1]) => test.withReducerTx(auth, body)
  const procedure = (auth: TestAuth) => test.procedureContext(auth)
  return { test, operator, at, call, procedure }
}

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key]
})

describe('auth configuration', () => {
  it('refuses to initialize a database with an invalid issuer', () => {
    const test = createModuleTestHarness(spacetime, module)
    Object.assign(env, { AUTH_ISSUER: 'http://praetorium.gg/api/auth', AUTH_AUDIENCE: AUDIENCE, OPERATOR_IDENTITY: '00'.repeat(32) })
    expect(() => test.withReducerTx(TestAuth.internal(), (ctx) => module.init(ctx, {}))).toThrow('Invalid auth configuration')
  })

  it('serves an operator procedure to the configured operator', () => {
    const { operator, procedure } = harness()
    expect(module.operatorHealth(procedure(operator), {})).toBe(true)
  })

  it('refuses an operator procedure to anyone else', () => {
    const { procedure } = harness()
    expect(() => module.operatorHealth(procedure(stranger()), {})).toThrow('Operator required')
  })
})

describe('session access', () => {
  it('records a player session until its token expires', () => {
    const { test, call } = harness()
    call(player('session-1'), (ctx) => module.onConnect(ctx, {}))
    expect(test.db.sessionAccess.subject.find('session-1')).toMatchObject({ userId: 'user-of-session-1', expiresAt: BigInt(NOW + 300) })
  })

  it('refuses a token from another issuer', () => {
    const { call } = harness()
    expect(() => call(player('session-1', { iss: 'https://elsewhere.example/api/auth' }), (ctx) => module.onConnect(ctx, {}))).toThrow(
      'Invalid auth token',
    )
  })

  it('admits a SpacetimeDB guest without a session', () => {
    const { test, call } = harness()
    const claims = { iss: 'https://spacetime.example', sub: 'guest', aud: ['spacetimedb'] }
    const identity = call(signed(claims), (ctx) => ctx.sender.toHexString())
    call(signed({ ...claims, hex_identity: identity }), (ctx) => module.onConnect(ctx, {}))
    expect(test.db.sessionAccess.count()).toBe(0n)
  })

  it('refuses a session that revoked its own access', () => {
    const { call } = harness()
    call(player('session-1'), (ctx) => module.onConnect(ctx, {}))
    call(player('session-1'), (ctx) => module.revokeOwnAccess(ctx, {}))
    expect(() => call(player('session-1'), (ctx) => module.onConnect(ctx, {}))).toThrow('Invalid auth token')
  })

  it('ends access once the expiry timer runs after the token lapsed', () => {
    const { test, call, at } = harness()
    call(player('session-1'), (ctx) => module.onConnect(ctx, {}))
    const timer = test.db.accessExpiry.iter().next().value!
    at(NOW + 300)
    call(TestAuth.internal(), (ctx) => module.expireAccess(ctx, { timer }))
    expect(test.db.sessionAccess.subject.find('session-1')).toBeNull()
  })

  it('keeps access a later token renewed when an earlier expiry timer runs', () => {
    const { test, call, at } = harness()
    call(player('session-1'), (ctx) => module.onConnect(ctx, {}))
    const timer = test.db.accessExpiry.iter().next().value!
    at(NOW + 240)
    call(player('session-1', { accessExpiresAt: NOW + 540, exp: NOW + 540 }), (ctx) => module.onConnect(ctx, {}))
    at(NOW + 300)
    call(TestAuth.internal(), (ctx) => module.expireAccess(ctx, { timer }))
    expect(test.db.sessionAccess.subject.find('session-1')?.expiresAt).toBe(BigInt(NOW + 540))
  })
})

describe('battle commands', () => {
  const creator = 'creator'
  const create = (procedure: ReturnType<typeof harness>['procedure'], operator: TestAuth, initialCommands: unknown[] = []) =>
    module.createBattle(procedure(operator), {
      payload: JSON.stringify({
        id: 'battle',
        token: 'battle-token',
        userId: creator,
        allyIds: [],
        opponentIds: ['opponent'],
        initialCommands,
        now: NOW,
      }),
    })
  const submit = (
    procedure: ReturnType<typeof harness>['procedure'],
    operator: TestAuth,
    input: { userId?: string; expectedSeq: number; externalRefusal?: string },
  ) =>
    JSON.parse(
      module.submitBattle(procedure(operator), {
        battleId: 'battle',
        userId: input.userId ?? creator,
        expectedSeq: input.expectedSeq,
        body: JSON.stringify({ kind: 'set-setup-step', step: 1 }),
        now: BigInt(NOW),
        externalRefusal: input.externalRefusal ?? '',
      }),
    ) as { result: { outcome: string; reason?: string } }

  it('appends a command at the expected sequence', () => {
    const { operator, procedure } = harness()
    create(procedure, operator)
    expect(submit(procedure, operator, { expectedSeq: 0 }).result.outcome).toBe('appended')
  })

  it('answers a command built on an older sequence as stale without appending it', () => {
    const { test, operator, procedure } = harness()
    create(procedure, operator)
    submit(procedure, operator, { expectedSeq: 0 })
    expect([submit(procedure, operator, { expectedSeq: 0 }).result.outcome, test.db.commands.count()]).toEqual(['stale', 1n])
  })

  it('refuses a player who is not seated without appending', () => {
    const { test, operator, procedure } = harness()
    create(procedure, operator)
    expect([submit(procedure, operator, { userId: 'outsider', expectedSeq: 0 }).result.outcome, test.db.commands.count()]).toEqual([
      'refused',
      0n,
    ])
  })

  it('records nothing when the web server refuses the command', () => {
    const { test, operator, procedure } = harness()
    create(procedure, operator)
    expect([
      submit(procedure, operator, { expectedSeq: 0, externalRefusal: 'choose a deployment' }).result.outcome,
      test.db.commands.count(),
    ]).toEqual(['refused', 0n])
  })

  it('creates no battle when its first command is refused', () => {
    const { test, operator, procedure } = harness()
    expect(() => create(procedure, operator, [{ kind: 'begin-battle', firstPlayerId: 'stranger' }])).toThrow()
    expect(test.db.battles.count()).toBe(0n)
  })
})

describe('roster lock', () => {
  const roster = (picks: string) =>
    JSON.stringify({
      id: 'roster',
      userId: 'owner',
      name: 'Finished list',
      automaticName: false,
      catalogueId: 'catalogue-proof',
      detachmentId: '["detachment-proof"]',
      disposition: null,
      limit: 1_000,
      picks,
      prep: null,
      tags: '[]',
      waivedRules: '[]',
      optionalRules: '[]',
      borrowedDetachmentId: null,
      baseRosterId: null,
      visibility: 'private',
      source: 'editable',
      now: NOW,
    })

  it('refuses a content save to a locked roster and keeps its picks', () => {
    const { test, operator, procedure } = harness()
    module.saveRoster(procedure(operator), { payload: roster('[{"entryId":"unit-proof"}]') })
    module.setRosterLocked(procedure(operator), { id: 'roster', userId: 'owner', locked: true, now: BigInt(NOW + 1) })
    expect([module.saveRoster(procedure(operator), { payload: roster('[]') }), test.db.rosters.id.find('roster')?.picks]).toEqual([
      'locked',
      '[{"entryId":"unit-proof"}]',
    ])
  })
})
