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

describe('saved action acknowledgements', () => {
  const input = () => ({
    id: '00000000-0000-4000-8000-000000000001',
    owner: 'creator',
    fingerprint: 'a'.repeat(64),
    createdAt: NOW * 1_000,
    name: 'set_battle_audience',
    args: ['creator', 'friends', NOW * 1_000],
    reportApplied: true,
  })

  it('identifies the transaction that applied a saved action', () => {
    const { procedure, operator } = harness()
    expect(JSON.parse(module.syncProduct(procedure(operator), { payload: JSON.stringify(input()) }))).toEqual({
      result: '"friends"',
      applied: true,
    })
  })

  it('does not report a replayed receipt as a newly applied action', () => {
    const { procedure, operator } = harness()
    const data = input()
    module.syncProduct(procedure(operator), { payload: JSON.stringify(data) })
    expect(JSON.parse(module.syncProduct(procedure(operator), { payload: JSON.stringify(data) }))).toEqual({
      result: '"friends"',
      applied: false,
    })
  })

  it('preserves the response existing servers expect', () => {
    const { procedure, operator } = harness()
    const data = { ...input(), reportApplied: undefined }
    const first = module.syncProduct(procedure(operator), { payload: JSON.stringify(data) })
    expect([first, module.syncProduct(procedure(operator), { payload: JSON.stringify(data) })]).toEqual(['"friends"', '"friends"'])
  })
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
    input: {
      userId?: string
      expectedSeq: number
      externalRefusal?: string
      sync?: { operationId: string; fingerprint: string; at: number; reportApplied?: boolean }
    },
  ) =>
    JSON.parse(
      module.submitBattle(procedure(operator), {
        battleId: 'battle',
        userId: input.userId ?? creator,
        expectedSeq: input.expectedSeq,
        body: JSON.stringify({ kind: 'set-setup-step', step: 1, ...(input.sync ? { $sync: input.sync } : {}) }),
        now: BigInt(NOW),
        externalRefusal: input.externalRefusal ?? '',
      }),
    ) as { result: { outcome: string; reason?: string }; applied?: boolean }

  it('reports the atomic application of a synced command only once', () => {
    const { operator, procedure } = harness()
    create(procedure, operator)
    const input = {
      expectedSeq: 0,
      sync: { operationId: '00000000-0000-4000-8000-000000000001', fingerprint: 'a'.repeat(64), at: NOW, reportApplied: true },
    }
    expect([submit(procedure, operator, input).applied, submit(procedure, operator, input).applied]).toEqual([true, false])
  })

  it.each([undefined, { operationId: '00000000-0000-4000-8000-000000000001', fingerprint: 'a'.repeat(64), at: NOW }])(
    'preserves the legacy command response when no applied report is requested (%j)',
    (sync) => {
      const { operator, procedure } = harness()
      create(procedure, operator)
      expect(submit(procedure, operator, { expectedSeq: 0, sync })).not.toHaveProperty('applied')
    },
  )

  it.each([{ expectedSeq: 1 }, { expectedSeq: 0, externalRefusal: 'private refusal details' }])(
    'does not report a new application when a synced command is refused or stale (%j)',
    (input) => {
      const { test, operator, procedure } = harness()
      create(procedure, operator)
      const result = submit(procedure, operator, {
        ...input,
        sync: { operationId: '00000000-0000-4000-8000-000000000001', fingerprint: 'a'.repeat(64), at: NOW, reportApplied: true },
      })
      expect([result.applied, test.db.commands.count()]).toEqual([false, 0n])
    },
  )

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

describe('guest seats', () => {
  const create = (procedure: ReturnType<typeof harness>['procedure'], operator: TestAuth, seats: Record<string, unknown>) =>
    JSON.parse(
      module.createBattle(procedure(operator), {
        payload: JSON.stringify({
          id: 'battle',
          token: 'battle-token',
          userId: 'host',
          allyIds: [],
          opponentIds: [],
          ...seats,
          now: NOW * 1_000,
        }),
      }),
    ) as { seats: { id: string; side: number; automated: boolean; guestName?: string }[] }
  const publicFeed = (procedure: ReturnType<typeof harness>['procedure'], operator: TestAuth) =>
    (
      JSON.parse(
        module.battleFeed(procedure(operator), {
          payload: JSON.stringify({
            scope: 'public',
            userId: null,
            viewerId: null,
            withUserId: null,
            leagueToken: null,
            eventToken: null,
            since: null,
            before: null,
            limit: 10,
          }),
        }),
      ) as { battles: { battle: { id: string } }[] }
    ).battles.map((row) => row.battle.id)

  it('seats a guest the host names, played by the table', () => {
    const { operator, procedure } = harness()
    expect(create(procedure, operator, { guestNames: ['Alex'], initialCommands: [] }).seats[1]).toEqual({
      id: 'guest:battle:0',
      side: 1,
      automated: true,
      guestName: 'Alex',
    })
  })

  it('refuses an account seat that claims a guest seat', () => {
    const { operator, procedure } = harness()
    expect(() => create(procedure, operator, { opponentIds: ['guest:other:0'], initialCommands: [] })).toThrow('Invalid battle seats')
  })

  it('keeps no product revisions for a guest', () => {
    const { test, operator, procedure } = harness()
    create(procedure, operator, { guestNames: ['Alex'], initialCommands: [] })
    expect(Array.from(test.db.productRevisions.userId.filter('guest:battle:0'))).toEqual([])
  })

  it('refuses a friendship with a guest', () => {
    const { operator, procedure } = harness()
    create(procedure, operator, { guestNames: ['Alex'], initialCommands: [] })
    expect(() =>
      module.requestFriend(procedure(operator), { requesterId: 'host', addresseeId: 'guest:battle:0', now: BigInt(NOW) }),
    ).toThrow('Invalid friendship')
  })

  it('lists a guest battle publicly when the host shares battles publicly', () => {
    const { operator, procedure } = harness()
    create(procedure, operator, { guestNames: ['Alex'], initialCommands: [] })
    expect(publicFeed(procedure, operator)).toEqual(['battle'])
  })

  it('keeps a guest battle out of the public feed when the host keeps battles to players', () => {
    const { operator, procedure } = harness()
    create(procedure, operator, { guestNames: ['Alex'], initialCommands: [] })
    module.setBattleAudience(procedure(operator), { userId: 'host', audience: 'private', now: BigInt(NOW) })
    expect(publicFeed(procedure, operator)).toEqual([])
  })
})

describe('guest devices', () => {
  const GUEST = 'guest:battle:0'
  const setup = () => {
    const h = harness()
    module.createBattle(h.procedure(h.operator), {
      payload: JSON.stringify({
        id: 'battle',
        token: 'battle-token',
        userId: 'host',
        allyIds: [],
        opponentIds: [],
        guestNames: ['Alex'],
        initialCommands: [],
        now: NOW * 1_000,
      }),
    })
    const read = <T>(json: string) => JSON.parse(json) as T
    const invite = (seatId = GUEST, replace = false) => {
      const input = { battleId: 'battle', seatId, invite: replace ? 'renewed' : 'first' }
      const procedure = h.procedure(h.operator)
      return read<string>(replace ? module.replaceGuestInvite(procedure, input) : module.guestInvite(procedure, input))
    }
    const join = (code: string, deviceHash = 'a'.repeat(64)) =>
      read<unknown>(module.joinGuestSeat(h.procedure(h.operator), { invite: code, deviceHash, now: BigInt(NOW * 1_000) }))
    const device = () => read<unknown>(module.guestDevice(h.procedure(h.operator), { seatId: GUEST }))
    const seat = () =>
      read<{ seats: { id: string; automated: boolean }[] }>(
        module.battleForOperator(h.procedure(h.operator), { battleId: 'battle' }),
      ).seats.find((one) => one.id === GUEST)
    const finish = () =>
      h.call(TestAuth.internal(), (ctx) => {
        for (const [seq, body] of [
          { kind: 'begin-battle', firstPlayerId: 'host' },
          { kind: 'end-battle', reason: 'conceded', concededBy: GUEST },
        ].entries())
          ctx.db.commands.insert({
            key: JSON.stringify(['battle', seq + 1]),
            battleId: 'battle',
            seq: seq + 1,
            userId: seq ? GUEST : 'host',
            at: BigInt(NOW * 1_000),
            body: JSON.stringify(body),
          })
      })
    const claim = (deviceHash = 'a'.repeat(64), userId = 'newcomer') =>
      read<unknown>(
        module.claimGuestSeat(h.procedure(h.operator), { battleId: 'battle', seatId: GUEST, userId, deviceHash, now: BigInt(NOW * 1_000) }),
      )
    return { ...h, invite, join, device, seat, finish, claim }
  }

  it('keeps one invite per guest seat', () => {
    const { invite } = setup()
    invite()
    expect(invite()).toBe('first')
  })

  it('refuses an invite for a seat that is not a guest', () => {
    const { invite } = setup()
    expect(() => invite('host')).toThrow('Invalid guest seat')
  })

  it('seats the device that opens the invite', () => {
    const { invite, join } = setup()
    expect(join(invite())).toEqual({ battleId: 'battle', token: 'battle-token', seatId: GUEST })
  })

  it('refuses a second device once the guest has joined', () => {
    const { invite, join } = setup()
    const code = invite()
    join(code)
    expect(join(code, 'b'.repeat(64))).toBe('taken')
  })

  it('refuses an invite the host replaced', () => {
    const { invite, join } = setup()
    const code = invite()
    invite(GUEST, true)
    expect(join(code)).toBe('missing')
  })

  it('remembers only the hash of the joined device', () => {
    const { invite, join, device } = setup()
    join(invite())
    expect(device()).toEqual({ battleId: 'battle', token: 'battle-token', deviceHash: 'a'.repeat(64), joinedAt: NOW * 1_000 })
  })

  it('stops the table playing a guest who joined on their own device', () => {
    const { invite, join, seat } = setup()
    join(invite())
    expect(seat()?.automated).toBe(false)
  })

  it('hands the seat back to the table when the host replaces the invite', () => {
    const { invite, join, seat } = setup()
    join(invite())
    invite(GUEST, true)
    expect(seat()?.automated).toBe(true)
  })

  it('forgets guest devices with their battle', () => {
    const { test, invite, join, operator, procedure } = setup()
    join(invite())
    module.deleteBattleForOperator(procedure(operator), { battleId: 'battle' })
    expect(test.db.guestSeats.count()).toBe(0n)
  })

  it('moves a finished battle onto the account that claims the guest seat', () => {
    const { invite, join, finish, claim, operator, procedure } = setup()
    join(invite())
    finish()
    expect(claim()).toBe('claimed')
    const data = JSON.parse(module.battleForOperator(procedure(operator), { battleId: 'battle' })) as {
      seats: { id: string; guestName?: string }[]
      log: { by: string; command: { concededBy?: string } }[]
    }
    expect([data.seats.map((one) => one.id), data.log.at(-1)?.by, data.log.at(-1)?.command.concededBy, data.seats[1]?.guestName]).toEqual([
      ['host', 'newcomer'],
      'newcomer',
      'newcomer',
      undefined,
    ])
  })

  it('refuses a claim from a device that did not join', () => {
    const { invite, join, finish, claim } = setup()
    join(invite())
    finish()
    expect(claim('b'.repeat(64))).toBe('this device is not playing that seat')
  })

  it('refuses a claim before the battle finishes', () => {
    const { invite, join, claim } = setup()
    join(invite())
    expect(claim()).toBe('finish the battle before adding it to your record')
  })

  it('refuses a claim from the host', () => {
    const { invite, join, finish, claim } = setup()
    join(invite())
    finish()
    expect(claim('a'.repeat(64), 'host')).toBe('you already have a seat in this battle')
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

describe('collection counts', () => {
  const key = JSON.stringify(['owner', 'warriors'])
  const owned = (models: number, built: number, painted: number) => {
    const setup = harness()
    setup.call(setup.operator, (ctx) => module.setCollectionModels(ctx, { userId: 'owner', entryId: 'warriors', models, at: BigInt(NOW) }))
    setup.call(setup.operator, (ctx) => module.setCollectionProgress(ctx, { userId: 'owner', entryId: 'warriors', built, painted }))
    return setup
  }
  const row = ({ test }: ReturnType<typeof harness>) => {
    const found = test.db.collection.key.find(key)
    return { models: found?.models, built: found?.built, painted: found?.painted }
  }
  const imported = (setup: ReturnType<typeof harness>, rows: unknown[], replace = false) =>
    JSON.parse(
      module.importCollection(setup.procedure(setup.operator), { userId: 'owner', rows: JSON.stringify(rows), replace, at: BigInt(NOW) }),
    ) as unknown

  it('keeps built and painted counts', () => {
    expect(row(owned(10, 6, 2))).toEqual({ models: 10, built: 6, painted: 2 })
  })

  it('lowers built and painted counts above what is owned', () => {
    expect(row(owned(10, 20, 15))).toEqual({ models: 10, built: 10, painted: 10 })
  })

  it('lowers built and painted counts when fewer models are owned', () => {
    const setup = owned(10, 8, 5)
    setup.call(setup.operator, (ctx) =>
      module.setCollectionModels(ctx, { userId: 'owner', entryId: 'warriors', models: 4, at: BigInt(NOW) }),
    )
    expect(row(setup)).toEqual({ models: 4, built: 4, painted: 4 })
  })

  it('refuses progress for a datasheet that is not in the collection', () => {
    const { call, operator } = harness()
    expect(() =>
      call(operator, (ctx) => module.setCollectionProgress(ctx, { userId: 'owner', entryId: 'warriors', built: 1, painted: 0 })),
    ).toThrow('Add this datasheet')
  })

  it('removes a wish set to zero', () => {
    const { test, call, operator } = harness()
    call(operator, (ctx) => module.setCollectionWanted(ctx, { userId: 'owner', entryId: 'warriors', wanted: 5, at: BigInt(NOW) }))
    call(operator, (ctx) => module.setCollectionWanted(ctx, { userId: 'owner', entryId: 'warriors', wanted: 0, at: BigInt(NOW) }))
    expect(test.db.collectionWishes.key.find(key)).toBeNull()
  })

  it('imports a datasheet the collection lacks', () => {
    const setup = harness()
    imported(setup, [{ entryId: 'warriors', models: 10, built: 4, painted: 1, wanted: 0 }])
    expect(row(setup)).toEqual({ models: 10, built: 4, painted: 1 })
  })

  it('keeps saved counts an import differs from', () => {
    const setup = owned(10, 6, 2)
    expect([imported(setup, [{ entryId: 'warriors', models: 20, built: 0, painted: 0, wanted: 3 }]), row(setup)]).toEqual([
      { added: 1, replaced: 0, kept: 1 },
      { models: 10, built: 6, painted: 2 },
    ])
  })

  it('adds a wish beside identical owned counts without keeping anything', () => {
    const setup = owned(10, 6, 2)
    expect(imported(setup, [{ entryId: 'warriors', models: 10, built: 6, painted: 2, wanted: 3 }])).toEqual({
      added: 1,
      replaced: 0,
      kept: 0,
    })
  })

  it('replaces saved counts when asked', () => {
    const setup = owned(10, 6, 2)
    imported(setup, [{ entryId: 'warriors', models: 20, built: 0, painted: 0, wanted: 0 }], true)
    expect(row(setup)).toEqual({ models: 20, built: 0, painted: 0 })
  })

  it('refuses an import that lists a datasheet twice', () => {
    const setup = harness()
    const rows = [{ entryId: 'warriors', models: 1, built: 0, painted: 0, wanted: 0 }]
    expect(() => imported(setup, [...rows, ...rows])).toThrow()
  })

  it('deletes wishes with the account', () => {
    const { test, call, operator } = harness()
    call(operator, (ctx) => module.setCollectionWanted(ctx, { userId: 'owner', entryId: 'warriors', wanted: 5, at: BigInt(NOW) }))
    call(operator, (ctx) => module.deleteUserData(ctx, { userId: 'owner' }))
    expect(test.db.collectionWishes.key.find(key)).toBeNull()
  })
})

describe('roster discovery', () => {
  const save = (procedure: ReturnType<typeof harness>['procedure'], operator: TestAuth, id: string, userId: string) =>
    module.saveRoster(procedure(operator), {
      payload: JSON.stringify({
        id,
        userId,
        name: id,
        automaticName: false,
        catalogueId: 'catalogue-proof',
        detachmentId: '["detachment-proof"]',
        disposition: null,
        limit: 1_000,
        picks: '[]',
        prep: null,
        tags: '[]',
        waivedRules: '[]',
        optionalRules: '[]',
        borrowedDetachmentId: null,
        baseRosterId: null,
        visibility: 'public',
        source: 'editable',
        now: NOW,
      }),
    })
  const friendsPage = (procedure: ReturnType<typeof harness>['procedure'], operator: TestAuth) =>
    (
      JSON.parse(
        module.discoverRosters(procedure(operator), {
          payload: JSON.stringify({
            audience: 'friends',
            viewerId: 'viewer',
            catalogueIds: null,
            detachmentIds: null,
            before: null,
            limit: 10,
          }),
        }),
      ) as { rows: { id: string }[] }
    ).rows.map((row) => row.id)

  it('lists only accepted friends to the friends audience', () => {
    const { operator, procedure } = harness()
    save(procedure, operator, 'friend-list', 'friend')
    save(procedure, operator, 'pending-list', 'pending')
    save(procedure, operator, 'stranger-list', 'stranger')
    module.requestFriend(procedure(operator), { requesterId: 'viewer', addresseeId: 'friend', now: BigInt(NOW) })
    module.acceptFriend(procedure(operator), { requesterId: 'viewer', addresseeId: 'friend', now: BigInt(NOW) })
    module.requestFriend(procedure(operator), { requesterId: 'pending', addresseeId: 'viewer', now: BigInt(NOW) })
    expect(friendsPage(procedure, operator)).toEqual(['friend-list'])
  })
})
