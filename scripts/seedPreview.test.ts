import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { localAuthDatabase } from '../src/server/localAuthDatabase'
import { createSqliteAuth } from '../src/server/sqliteAuth'
import { importAuthSqlite } from './nodeAuthSqlite'
import { previewAccountId, seedPreview } from './seedPreview'

afterEach(() => vi.unstubAllEnvs())

it('refuses to seed without the preview flag', async () => {
  vi.stubEnv('PRAETORIUM_SEED_PREVIEW', 'false')
  await expect(seedPreview()).rejects.toThrow('Refusing to seed a database without the preview flag')
})

it('refuses to seed without the hosted storage configuration', async () => {
  vi.stubEnv('PRAETORIUM_SEED_PREVIEW', 'true')
  vi.stubEnv('SPACETIME_URL', '')
  await expect(seedPreview()).rejects.toThrow('Preview seed requires SpacetimeDB and auth configuration')
})

it('recreates preview accounts with the same IDs in a fresh auth database', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'praetorium-preview-accounts-'))
  const ids: string[] = []
  try {
    for (const name of ['first', 'replacement']) {
      const file = path.join(directory, `${name}.sqlite`)
      await importAuthSqlite(path.resolve('drizzle-auth/0000_curly_gambit.sql'), file)
      const local = localAuthDatabase(file)
      try {
        const auth = createSqliteAuth(local.database, 'preview-auth-test-secret', {
          environment: {
            APP_URL: 'https://pr-599.praetorium.gg',
            AUTH_RATE_LIMIT: 'off',
            SPACETIME_AUDIENCE: 'praetorium-pr-599',
          },
          userIdForNewAccount: (email) => previewAccountId('praetorium-pr-599', email),
          deleteUserData: async () => {},
          revokeSessionAccess: async () => {},
          storeSocialAvatar: async () => null,
          updateProfile: async (data) => ({ ok: true, data }),
        })
        const created = await auth.api.signUpEmail({
          body: { email: 'preview@praetorium.gg', password: 'preview-preview-preview', name: 'Preview Player' },
        })
        ids.push(created.user.id)
      } finally {
        local.client.close()
      }
    }
    expect(ids[1]).toBe(ids[0])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
