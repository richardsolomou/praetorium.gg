import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { importAuthSqlite } from '../../scripts/nodeAuthSqlite'
import { DbConnection, tables } from '../spacetime/generated'
import { createSqliteAuth } from './sqliteAuth'
import { localAuthDatabase } from './localAuthDatabase'
import { SpacetimeOperator } from './spacetimeOperator'

const spacetimeUrl = process.env.SPACETIME_TEST_URL
const spacetimeDatabase = process.env.SPACETIME_TEST_DATABASE ?? 'praetorium-auth-proof'
const spacetimeAudience = process.env.SPACETIME_TEST_AUDIENCE ?? 'praetorium-auth-proof'
const operatorToken = process.env.SPACETIME_TEST_OPERATOR_TOKEN
const issuer = process.env.SPACETIME_TEST_ISSUER ?? 'http://127.0.0.1:8799'
const issuerPort = Number(new URL(issuer).port)
let directory: string
let local: ReturnType<typeof localAuthDatabase>

beforeAll(async () => {
  if (!spacetimeUrl) return
  directory = await mkdtemp(path.join(tmpdir(), 'praetorium-stdb-oidc-'))
  const file = path.join(directory, 'auth.sqlite')
  await importAuthSqlite(path.resolve('drizzle-auth/0000_curly_gambit.sql'), file)
  local = localAuthDatabase(file)
})

afterAll(async () => {
  local?.client.close()
  if (directory) await rm(directory, { recursive: true, force: true })
})

it.skipIf(!spacetimeUrl)('connects to SpacetimeDB with a session-bound Better Auth token', async () => {
  const auth = createSqliteAuth(local.database, 'praetorium-spacetime-local-proof-secret', {
    environment: { APP_URL: issuer, SPACETIME_AUDIENCE: spacetimeAudience, AUTH_RATE_LIMIT: 'off' },
    deleteUserData: async () => {},
    revokeSessionAccess: async () => {},
    storeSocialAvatar: async () => null,
    updateProfile: async (data) => ({ ok: true, data }),
  })
  const server = createServer(async (incoming, outgoing) => {
    const request = new Request(new URL(incoming.url ?? '/', issuer))
    const response = await auth.handler(request)
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    outgoing.end(Buffer.from(await response.arrayBuffer()))
  })
  await new Promise<void>((resolve) => server.listen(issuerPort, '127.0.0.1', resolve))
  try {
    const created = await auth.api.signUpEmail({
      body: { email: `spacetime-proof-${randomUUID()}@example.com`, password: 'password1234', name: 'Spacetime proof' },
      returnHeaders: true,
    })
    const cookie = created.headers.get('set-cookie')?.split(';')[0]
    if (!cookie) throw new Error('Missing session cookie')
    const headers = new Headers({ cookie })
    const session = await auth.api.getSession({ headers })
    if (!session) throw new Error('Missing authenticated session')
    const { token } = await auth.api.getToken({ headers })
    const actual = await new Promise<{ userId: string; subject: string }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('SpacetimeDB did not apply the subscription')), 10_000)
      const connection = DbConnection.builder()
        .withUri(spacetimeUrl!)
        .withDatabaseName(spacetimeDatabase)
        .withToken(token)
        .onConnect((current) => {
          current
            .subscriptionBuilder()
            .onApplied(() => {
              clearTimeout(timeout)
              const row = [...current.db.mySession.iter()][0]
              current.disconnect()
              if (row) resolve({ userId: row.userId, subject: row.subject })
              else reject(new Error('No authenticated SpacetimeDB session'))
            })
            .onError((context) => {
              clearTimeout(timeout)
              current.disconnect()
              reject(new Error(context.event?.message || 'SpacetimeDB subscription failed'))
            })
            .subscribe(tables.mySession)
        })
        .onConnectError((_context, error) => {
          clearTimeout(timeout)
          connection.disconnect()
          reject(new Error(error.message || 'SpacetimeDB rejected the authentication token'))
        })
        .build()
    })
    expect(actual).toEqual({ userId: created.response.user.id, subject: session.session.id })
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

it.skipIf(!spacetimeUrl || !operatorToken)(
  'streams private product changes to another session without exposing them to strangers',
  async () => {
    const auth = createSqliteAuth(local.database, 'praetorium-spacetime-local-proof-secret', {
      environment: { APP_URL: issuer, SPACETIME_AUDIENCE: spacetimeAudience, AUTH_RATE_LIMIT: 'off' },
      deleteUserData: async () => {},
      revokeSessionAccess: async () => {},
      storeSocialAvatar: async () => null,
      updateProfile: async (data) => ({ ok: true, data }),
    })
    const server = createServer(async (incoming, outgoing) => {
      const response = await auth.handler(new Request(new URL(incoming.url ?? '/', issuer)))
      outgoing.writeHead(response.status, Object.fromEntries(response.headers))
      outgoing.end(Buffer.from(await response.arrayBuffer()))
    })
    await new Promise<void>((resolve) => server.listen(issuerPort, '127.0.0.1', resolve))
    const rosterId = randomUUID()
    const operator = new SpacetimeOperator(spacetimeUrl!, spacetimeDatabase, operatorToken!)
    let disconnect = () => {}
    try {
      const signup = await auth.api.signUpEmail({
        body: { email: `roster-signal-${rosterId}@example.com`, password: 'password1234', name: 'Roster signal' },
        returnHeaders: true,
      })
      const cookie = signup.headers.get('set-cookie')?.split(';')[0]
      if (!cookie) throw new Error('Missing session cookie')
      const token = (await auth.api.getToken({ headers: new Headers({ cookie }) })).token
      const events: bigint[] = []
      const scopes = new Map<string, bigint>()
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Product subscription was not applied')), 10_000)
        const connection = DbConnection.builder()
          .withUri(spacetimeUrl!)
          .withDatabaseName(spacetimeDatabase)
          .withToken(token)
          .onConnect((current) => {
            current.db.myProductSignals.onInsert((_context, row) => {
              scopes.set(row.scope, row.revision)
              if (row.scope === 'rosters') events.push(row.revision)
            })
            current.db.myProductSignals.onUpdate((_context, _previous, row) => {
              scopes.set(row.scope, row.revision)
              if (row.scope === 'rosters') events.push(row.revision)
            })
            current
              .subscriptionBuilder()
              .onApplied(() => {
                clearTimeout(timeout)
                resolve()
              })
              .onError((context) => reject(new Error(context.event?.message || 'Product subscription failed')))
              .subscribe([tables.mySession, tables.myProductSignals])
          })
          .onConnectError((_current, error) => reject(error))
          .build()
        disconnect = () => connection.disconnect()
      })
      const input = {
        id: rosterId,
        userId: signup.response.user.id,
        name: 'Proof roster',
        catalogueId: 'catalogue-proof',
        detachmentId: null,
        disposition: null,
        limit: 1_000,
        picks: '[]',
        prep: null,
        tags: '[]',
        waivedRules: '[]',
        visibility: 'private' as const,
        source: 'editable' as const,
        now: Date.now(),
      }
      expect(await operator.saveRoster(input)).toBe('inserted')
      await vi.waitFor(() => expect(events).toEqual([1n]))
      expect(await operator.saveRoster({ ...input, name: 'Updated' })).toBe('updated')
      await vi.waitFor(() => expect(events).toEqual([1n, 2n]))
      await operator.deleteRoster(rosterId, input.userId)
      await vi.waitFor(() => expect(events).toEqual([1n, 2n, 3n]))

      await operator.addToCollection({ userId: input.userId, entryId: rosterId, now: Date.now() })
      await vi.waitFor(() => expect(scopes.get('collection')).toBe(1n))
      await operator.addFavouriteFaction({ userId: input.userId, catalogueId: 'catalogue-proof', now: Date.now() })
      await vi.waitFor(() => expect(scopes.get('favourites')).toBe(1n))
      await operator.replaceFriendInvite(input.userId, randomUUID(), Date.now())
      await vi.waitFor(() => expect(scopes.get('invites')).toBe(1n))
      await operator.setPushEnabled(input.userId, false, Date.now())
      await vi.waitFor(() => expect(scopes.get('settings')).toBe(1n))
      const onboardingBefore = scopes.get('onboarding') ?? 0n
      await operator.updateOnboardingProgress(input.userId, { operation: 'welcome' })
      await vi.waitFor(() => expect(scopes.get('onboarding')).toBe(onboardingBefore + 1n))

      const outsider = await auth.api.signUpEmail({
        body: { email: `roster-outsider-${rosterId}@example.com`, password: 'password1234', name: 'Other player' },
        returnHeaders: true,
      })
      const outsiderCookie = outsider.headers.get('set-cookie')?.split(';')[0]
      if (!outsiderCookie) throw new Error('Missing other session cookie')
      const outsiderToken = (await auth.api.getToken({ headers: new Headers({ cookie: outsiderCookie }) })).token
      await operator.requestFriend(input.userId, outsider.response.user.id, Date.now())
      await vi.waitFor(() => expect(scopes.get('friends')).toBe(1n))
      const visible = await new Promise<string[]>((resolve, reject) => {
        const connection = DbConnection.builder()
          .withUri(spacetimeUrl!)
          .withDatabaseName(spacetimeDatabase)
          .withToken(outsiderToken)
          .onConnect((current) => {
            current
              .subscriptionBuilder()
              .onApplied(() => {
                const visibleScopes = [...current.db.myProductSignals.iter()].map((row) => row.scope).sort()
                current.disconnect()
                resolve(visibleScopes)
              })
              .onError((context) => reject(new Error(context.event?.message || 'Other subscription failed')))
              .subscribe(tables.myProductSignals)
          })
          .onConnectError((_current, error) => {
            connection.disconnect()
            reject(error)
          })
          .build()
      })
      expect(visible).toEqual(['friends', 'onboarding'])
    } finally {
      disconnect()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  },
)

it.skipIf(!spacetimeUrl || !operatorToken)('streams private product counts only to an admin session', async () => {
  const auth = createSqliteAuth(local.database, 'praetorium-spacetime-local-proof-secret', {
    environment: { APP_URL: issuer, SPACETIME_AUDIENCE: spacetimeAudience, AUTH_RATE_LIMIT: 'off' },
    deleteUserData: async () => {},
    revokeSessionAccess: async () => {},
    storeSocialAvatar: async () => null,
    updateProfile: async (data) => ({ ok: true, data }),
  })
  const server = createServer(async (incoming, outgoing) => {
    const response = await auth.handler(new Request(new URL(incoming.url ?? '/', issuer)))
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    outgoing.end(Buffer.from(await response.arrayBuffer()))
  })
  await new Promise<void>((resolve) => server.listen(issuerPort, '127.0.0.1', resolve))
  const operator = new SpacetimeOperator(spacetimeUrl!, spacetimeDatabase, operatorToken!)
  const rosterId = randomUUID()
  const disconnects: Array<() => void> = []
  try {
    const signUp = async (role: 'admin' | 'user') => {
      const created = await auth.api.signUpEmail({
        body: { email: `admin-signal-${randomUUID()}@example.com`, password: 'password1234', name: 'Signal proof' },
        returnHeaders: true,
      })
      await local.client.execute({ sql: 'update user set role = ? where id = ?', args: [role, created.response.user.id] })
      const cookie = created.headers.get('set-cookie')?.split(';')[0]
      if (!cookie) throw new Error('Missing session cookie')
      return { userId: created.response.user.id, token: (await auth.api.getToken({ headers: new Headers({ cookie }) })).token }
    }
    const admin = await signUp('admin')
    const ordinary = await signUp('user')
    const revisions: bigint[] = []
    const subscribe = (token: string, onRevision: (revision: bigint) => void) =>
      new Promise<bigint | null>((resolve, reject) => {
        const connection = DbConnection.builder()
          .withUri(spacetimeUrl!)
          .withDatabaseName(spacetimeDatabase)
          .withToken(token)
          .onConnect((current) => {
            let applied = false
            const changed = (row: { scope: string; revision: bigint }) => {
              if (applied && row.scope === 'admin-users') onRevision(row.revision)
            }
            current.db.myAdminSignals.onInsert((_context, row) => changed(row))
            current.db.myAdminSignals.onUpdate((_context, _previous, row) => changed(row))
            current
              .subscriptionBuilder()
              .onApplied(() => {
                applied = true
                resolve([...current.db.myAdminSignals.iter()].find((row) => row.scope === 'admin-users')?.revision ?? null)
              })
              .onError((context) => reject(new Error(context.event?.message || 'Admin subscription failed')))
              .subscribe(tables.myAdminSignals)
          })
          .onConnectError((_current, error) => reject(error))
          .build()
        disconnects.push(() => connection.disconnect())
      })
    const baseline = await subscribe(admin.token, (revision) => revisions.push(revision))
    expect(await subscribe(ordinary.token, () => revisions.push(-1n))).toBeNull()

    await operator.saveRoster({
      id: rosterId,
      userId: ordinary.userId,
      name: 'Private roster',
      catalogueId: 'catalogue-proof',
      detachmentId: null,
      disposition: null,
      limit: 1_000,
      picks: '[]',
      prep: null,
      tags: '[]',
      waivedRules: '[]',
      visibility: 'private',
      source: 'editable',
      now: Date.now(),
    })
    await vi.waitFor(() => expect(revisions.at(-1)).toBe((baseline ?? 0n) + 1n))
    expect(revisions).not.toContain(-1n)
  } finally {
    for (const disconnect of disconnects) disconnect()
    await operator.deleteRoster(rosterId, (await operator.roster(rosterId))?.userId ?? '')
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

it.skipIf(!spacetimeUrl || !operatorToken)('streams only a seated player’s watched battle sequence', async () => {
  const auth = createSqliteAuth(local.database, 'praetorium-spacetime-local-proof-secret', {
    environment: { APP_URL: issuer, SPACETIME_AUDIENCE: spacetimeAudience, AUTH_RATE_LIMIT: 'off' },
    deleteUserData: async () => {},
    revokeSessionAccess: async () => {},
    storeSocialAvatar: async () => null,
    updateProfile: async (data) => ({ ok: true, data }),
  })
  const server = createServer(async (incoming, outgoing) => {
    const request = new Request(new URL(incoming.url ?? '/', issuer))
    const response = await auth.handler(request)
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    outgoing.end(Buffer.from(await response.arrayBuffer()))
  })
  await new Promise<void>((resolve) => server.listen(issuerPort, '127.0.0.1', resolve))
  const operator = new SpacetimeOperator(spacetimeUrl!, spacetimeDatabase, operatorToken!)
  const battleId = randomUUID()
  const battleToken = randomUUID()
  let created = false
  try {
    const signup = await auth.api.signUpEmail({
      body: { email: `signal-${battleId}@example.com`, password: 'password1234', name: 'Signal proof' },
      returnHeaders: true,
    })
    const userId = signup.response.user.id
    const cookie = signup.headers.get('set-cookie')?.split(';')[0]
    if (!cookie) throw new Error('Missing session cookie')
    const token = (await auth.api.getToken({ headers: new Headers({ cookie }) })).token
    await operator.createBattle({ id: battleId, token: battleToken, userId, opponentIds: [randomUUID()], now: Date.now() })
    created = true
    const seq = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('SpacetimeDB did not publish the battle signal')), 10_000)
      const connection = DbConnection.builder()
        .withUri(spacetimeUrl!)
        .withDatabaseName(spacetimeDatabase)
        .withToken(token)
        .onConnect((current) => {
          const fail = (error: unknown) => {
            clearTimeout(timeout)
            current.disconnect()
            reject(error)
          }
          current.db.myBattleSignals.onInsert((_context, row) => {
            if (row.battleId !== battleId) return
            void operator
              .submit({ battleId, userId, expectedSeq: 0, command: { kind: 'set-setup-step', step: 1 }, now: Date.now() })
              .catch(fail)
          })
          current.db.myBattleSignals.onUpdate((_context, _previous, row) => {
            if (row.battleId !== battleId || row.seq !== 1) return
            clearTimeout(timeout)
            current.disconnect()
            resolve(row.seq)
          })
          current
            .subscriptionBuilder()
            .onApplied(() => {
              void current.reducers.watchBattle({ battleId: randomUUID() }).then(
                () => fail(new Error('A player watched an unseated battle')),
                (error: unknown) => {
                  if (!(error instanceof Error) || !error.message.includes('Battle unavailable')) return fail(error)
                  void current.reducers.watchBattle({ battleId }).catch(fail)
                },
              )
            })
            .onError((context) => fail(new Error(context.event?.message || 'SpacetimeDB subscription failed')))
            .subscribe(tables.myBattleSignals)
        })
        .onConnectError((_context, error) => {
          clearTimeout(timeout)
          connection.disconnect()
          reject(error)
        })
        .build()
    })
    expect(seq).toBe(1)
    await operator.deleteBattle(battleId, userId)
    created = false
  } finally {
    if (created) {
      const snapshot = await operator.battleForOperator(battleId)
      await operator.deleteBattle(battleId, snapshot.seats[0]!.id)
    }
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

it.skipIf(!spacetimeUrl || !operatorToken)('removes product signal access when the SQLite session is signed out', async () => {
  const operator = new SpacetimeOperator(spacetimeUrl!, spacetimeDatabase, operatorToken!)
  const auth = createSqliteAuth(local.database, 'praetorium-spacetime-local-proof-secret', {
    environment: { APP_URL: issuer, SPACETIME_AUDIENCE: spacetimeAudience, AUTH_RATE_LIMIT: 'off' },
    deleteUserData: async () => {},
    revokeSessionAccess: (sessionId) => operator.revokeSession(sessionId),
    storeSocialAvatar: async () => null,
    updateProfile: async (data) => ({ ok: true, data }),
  })
  const server = createServer(async (incoming, outgoing) => {
    const response = await auth.handler(new Request(new URL(incoming.url ?? '/', issuer)))
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    outgoing.end(Buffer.from(await response.arrayBuffer()))
  })
  await new Promise<void>((resolve) => server.listen(issuerPort, '127.0.0.1', resolve))
  const battleId = randomUUID()
  let created = false
  try {
    const signup = await auth.api.signUpEmail({
      body: { email: `revoke-${battleId}@example.com`, password: 'password1234', name: 'Revoke proof' },
      returnHeaders: true,
    })
    const userId = signup.response.user.id
    const cookie = signup.headers.get('set-cookie')?.split(';')[0]
    if (!cookie) throw new Error('Missing session cookie')
    const headers = new Headers({ cookie })
    const token = (await auth.api.getToken({ headers })).token
    await operator.createBattle({ id: battleId, token: randomUUID(), userId, opponentIds: [randomUUID()], now: Date.now() })
    created = true
    const revoked = await new Promise<boolean>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Session revocation did not update the subscription')), 10_000)
      const connection = DbConnection.builder()
        .withUri(spacetimeUrl!)
        .withDatabaseName(spacetimeDatabase)
        .withToken(token)
        .onConnect((current) => {
          current.db.mySession.onDelete(() => {
            clearTimeout(timeout)
            current.disconnect()
            resolve([...current.db.myProductSignals.iter()].length === 0)
          })
          current
            .subscriptionBuilder()
            .onApplied(() => {
              if (![...current.db.myProductSignals.iter()].some((row) => row.scope === 'battles')) {
                reject(new Error('Seated battle was absent from product signals'))
                return
              }
              void auth.api.signOut({ headers }).catch(reject)
            })
            .onError((context) => reject(new Error(context.event?.message || 'Subscription failed')))
            .subscribe([tables.mySession, tables.myProductSignals])
        })
        .onConnectError((_current, error) => {
          clearTimeout(timeout)
          connection.disconnect()
          reject(error)
        })
        .build()
    })
    expect(revoked).toBe(true)
  } finally {
    if (created) {
      const snapshot = await operator.battleForOperator(battleId)
      await operator.deleteBattle(battleId, snapshot.seats[0]!.id)
    }
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
