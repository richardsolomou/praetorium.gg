import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { appendFile, cp, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { expect, it, vi } from 'vitest'
import { SpacetimeOperator } from '../src/server/spacetimeOperator'
import { migrateProductData } from './lib/productDataMigrations'
import { reserveLocalPort, startLocalChild, stopLocalChildren } from './lib/localStack'
import { moduleEnvironment } from './lib/spacetimeEnvironment'
import { installedSpacetimeCli } from './lib/spacetimeCli'
import { moduleEnvironmentHeaders } from 'ras-stack/spacetime'

const cli = process.env.SPACETIME_BIN ?? installedSpacetimeCli
const execute = promisify(execFile)
const fixture = `
export const seedMigrationFixture = spacetime.reducer({ broken: t.bool() }, (ctx, { broken }) => {
  requireOperator(ctx)
  const base = {
    userId: 'migration-owner', name: '', catalogueId: 'catalogue', disposition: undefined,
    detachmentId: 'first', limit: 2000, tags: '[]', waivedRules: '[]', optionalRules: '[]',
    borrowedDetachmentId: undefined, visibility: 'private', source: 'editable', createdAt: 1n, updatedAt: 2n,
    automaticName: undefined, locked: undefined, baseRosterId: undefined, copiedFromRosterId: undefined, pointsBudget: undefined, archived: undefined,
    picks: '[{"entryId":"unit","nickname":"Leader","note":"Hold home"}]',
    prep: '{"stratagems":[],"secondaries":[],"shareNotes":true,"remindersEnabled":false}',
  }
  for (const id of ['old', 'locked', 'current', 'bad']) ctx.db.rosters.id.delete(id)
  ctx.db.rosters.insert({ ...base, id: 'old' })
  ctx.db.rosters.insert({ ...base, id: 'locked', name: 'Locked', automaticName: false, locked: true })
  ctx.db.rosters.insert({ ...base, id: 'current', automaticName: false, locked: false, detachmentId: '["second","first"]', picks: '[{"entryId":"unit","note":"Hold home"}]', prep: undefined })
  if (broken) ctx.db.rosters.insert({ ...base, id: 'bad', picks: '{' })
  for (const [entryId, models] of [['heart', undefined], ['duplicate', undefined], ['models', 12]] as const) {
    const key = JSON.stringify([base.userId, entryId])
    ctx.db.collection.key.delete(key)
    ctx.db.collection.insert({ key, userId: base.userId, entryId, at: 3n, models, built: undefined, painted: undefined })
  }
  const key = JSON.stringify([base.userId, 'duplicate'])
  ctx.db.favouriteDatasheets.key.delete(key)
  ctx.db.favouriteDatasheets.insert({ key, userId: base.userId, entryId: 'duplicate', at: 9n })
  ctx.db.battleSharing.userId.delete(base.userId)
  ctx.db.battleSharing.insert({ userId: base.userId, audience: 'friends', at: 1n })
  ctx.db.collectionSharing.userId.delete(base.userId)
  ctx.db.collectionSharing.insert({ userId: base.userId, published: false })
})
`

it.skipIf(!existsSync(cli))(
  'backfills real saved rows atomically, preserves retries and rejects untrusted callers',
  { timeout: 90_000 },
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'praetorium-data-migrations-'))
    const port = await reserveLocalPort()
    const url = `http://127.0.0.1:${port.port}`
    const database = 'migration-test'
    let server: ReturnType<typeof startLocalChild> | undefined
    try {
      await cp('spacetimedb', path.join(root, 'spacetimedb'), {
        recursive: true,
        filter: (file) => !['node_modules', 'dist'].includes(path.basename(file)),
      })
      await cp('src/core', path.join(root, 'src/core'), { recursive: true })
      await cp('catalogue', path.join(root, 'catalogue'), { recursive: true })
      await symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir')
      await symlink(path.resolve('spacetimedb/node_modules'), path.join(root, 'spacetimedb/node_modules'), 'dir')
      await appendFile(path.join(root, 'spacetimedb/src/index.ts'), fixture)
      await execute(cli, ['build', '-p', path.join(root, 'spacetimedb')], { timeout: 30_000 }).catch(
        (error: { stdout: string; stderr: string }) => {
          throw new Error(`Product fixture build failed: ${error.stdout}\n${error.stderr}`)
        },
      )
      await port.release()
      server = startLocalChild(
        cli,
        ['start', '--listen-addr', `127.0.0.1:${port.port}`, '--data-dir', path.join(root, 'data'), '--non-interactive'],
        process.env,
      )
      await vi.waitFor(async () => expect((await fetch(`${url}/v1/database/${database}`)).status).toBe(404), { timeout: 15_000 })
      const identity = (await (await fetch(`${url}/v1/identity`, { method: 'POST' })).json()) as { identity: string; token: string }
      const send = async (pathname: string, body: BodyInit, token = identity.token, method: 'POST' | 'PUT' = 'POST') => {
        const headers = new Headers(
          method === 'PUT'
            ? moduleEnvironmentHeaders(moduleEnvironment({ issuer: `${url}/api/auth`, audience: database, operator: identity.identity }))
            : [],
        )
        headers.set('authorization', `Bearer ${token}`)
        headers.set('content-type', pathname === '/sql' ? 'text/plain' : 'application/json')
        const response = await fetch(`${url}/v1/database/${database}${pathname}`, {
          method,
          headers,
          body,
          signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`)
        return response
      }
      await send('?host_type=Js', await readFile(path.join(root, 'spacetimedb/dist/bundle.js')), identity.token, 'PUT')
      await send('/call/seed_migration_fixture', '[true]')
      const source = { url, database, ownerToken: identity.token, operatorToken: identity.token }
      const rawRoster = async (id: string) =>
        JSON.parse(await (await send('/call/roster_by_id', JSON.stringify([id]))).json()) as Record<string, unknown>
      const before = await rawRoster('old')
      await expect(send('/call/migrate_product_data', '["rosters",["old","bad"]]')).rejects.toThrow()
      expect(await rawRoster('old')).toEqual(before)
      await expect(send('/call/migrate_product_data', JSON.stringify(['rosters', Array(21).fill('old')]))).rejects.toThrow()
      const stranger = (await (await fetch(`${url}/v1/identity`, { method: 'POST' })).json()) as { token: string }
      await expect(send('/call/migrate_product_data', '["rosters",["old"]]', stranger.token)).rejects.toThrow('Operator required')
      await send('/call/seed_migration_fixture', '[false]')
      expect(await migrateProductData(source)).toEqual({ rosters: 2, collection: 2, battle_sharing: 1, collection_sharing: 1 })
      expect(await rawRoster('old')).toEqual({
        ...before,
        automaticName: true,
        locked: false,
        detachmentId: '["first"]',
        picks: '[{"entryId":"unit","note":"Hold home"}]',
        prep: '{"stratagems":[],"secondaries":[],"remindersEnabled":false}',
      })
      expect(await migrateProductData(source)).toEqual({ rosters: 0, collection: 0, battle_sharing: 0, collection_sharing: 0 })
      const store = new SpacetimeOperator(url, database, identity.token)
      expect(await store.collectionProfile('migration-owner', null)).toEqual({
        entries: [{ entryId: 'models', models: 12, built: 0, painted: 0 }],
        wishes: [],
      })
      expect(await store.favouriteDatasheetsByUser('migration-owner')).toEqual(
        expect.arrayContaining([
          { userId: 'migration-owner', entryId: 'heart', at: 3 },
          { userId: 'migration-owner', entryId: 'duplicate', at: 9 },
        ]),
      )
      const locked = (await store.roster('locked'))!
      const { createdAt: _created, updatedAt: _updated, locked: _locked, ...fields } = locked
      const row = JSON.stringify({
        ...fields,
        picks: '[{"entryId":"unit","nickname":"Leader","note":"Hold home"}]',
        prep: '{"stratagems":[],"secondaries":[],"shareNotes":true,"remindersEnabled":false}',
        detachmentId: 'first',
        now: 3,
      })
      const queued = { row, operationId: crypto.randomUUID(), fingerprint: 'a'.repeat(64), expectedVersion: 2, deleted: false }
      const saved = await store.syncRoster(queued)
      expect(await store.syncRoster(queued)).toEqual(saved)
      expect(saved).toEqual({ outcome: 'applied', version: 3, deleted: false, lifecycle: null })
      expect(await store.saveRoster({ ...fields, picks: '[]', now: 4 })).toBe('locked')
    } finally {
      if (server) await stopLocalChildren([server])
      await port.release()
      await rm(root, { recursive: true, force: true })
    }
  },
)
