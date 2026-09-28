import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { eq, inArray } from 'drizzle-orm'
import { expect, it, vi } from 'vitest'
import type { Roster } from '../src/core/battle'
import { account as authAccount, user } from '../src/db/authSchema'
import { SqliteAccountRepository } from '../src/server/accountRepository'
import { localAuthDatabase } from '../src/server/localAuthDatabase'
import { SpacetimeOperator } from '../src/server/spacetimeOperator'
import { SpacetimeRepository } from '../src/server/spacetimeRepository'
import { importAuthSqlite } from './nodeAuthSqlite'
import { PREVIEW_ACCOUNTS, PREVIEW_EMAIL, seedPreview } from './seedPreview'

const url = process.env.SPACETIME_TEST_URL
const databaseName = process.env.SPACETIME_TEST_DATABASE
const token = process.env.SPACETIME_TEST_OPERATOR_TOKEN

it.skipIf(!url || !databaseName || !token)(
  'seeds an isolated SQLite auth store and SpacetimeDB preview twice without duplicate product data',
  { timeout: 30_000 },
  async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'praetorium-preview-spacetime-'))
    const sqlitePath = path.join(directory, 'auth.sqlite')
    await importAuthSqlite(path.resolve('drizzle-auth/0000_curly_gambit.sql'), sqlitePath)
    const local = localAuthDatabase(sqlitePath)
    const snapshots = new Map(
      PREVIEW_ACCOUNTS.flatMap((account) =>
        account.rosters.map((saved) => {
          const snapshot: Roster = {
            id: saved.id,
            name: saved.name,
            text: `${saved.limit} pts`,
            built: {
              catalogueId: saved.catalogueId,
              revision: 'preview-test',
              limit: saved.limit,
              detachment: null,
              disposition: saved.disposition,
              units: [
                {
                  key: `${saved.id}-character`,
                  name: `${saved.name} character`,
                  points: 100,
                  models: 1,
                  group: 'character',
                  warlord: saved.warlord,
                  warlordEligible: true,
                },
              ],
            },
          }
          return [saved.id, snapshot] as const
        }),
      ),
    )
    try {
      vi.stubEnv('SPACETIME_URL', url)
      vi.stubEnv('SPACETIME_DATABASE', databaseName)
      vi.stubEnv('SPACETIME_OPERATOR_TOKEN', token)
      vi.stubEnv('APP_URL', 'http://127.0.0.1:8799')
      vi.stubEnv('SPACETIME_AUDIENCE', 'praetorium-auth-proof')
      vi.stubEnv('AUTH_SECRET', 'praetorium-disposable-preview-secret')
      vi.stubEnv('AUTH_RATE_LIMIT', 'off')
      vi.stubEnv('PRAETORIUM_SEED_PREVIEW', 'true')
      vi.stubEnv('AUTH_SQLITE_PATH', sqlitePath)
      await seedPreview(snapshots)
      await seedPreview(snapshots)
      const accounts = new SqliteAccountRepository(local.database)
      const product = new SpacetimeOperator(url!, databaseName!, token!)
      const repository = new SpacetimeRepository(accounts, product)
      const database = local.database
      const [preview] = await database.select({ id: user.id }).from(user).where(eq(user.email, PREVIEW_EMAIL))
      if (!preview) throw new Error('Preview account missing')
      expect((await repository.adminUsers({ limit: 10 })).users.find((row) => row.id === preview.id)?.rosterCount).toBe(8)
      expect((await repository.leagueByToken('preview-league-doubles', preview.id))?.entries).toHaveLength(4)
      expect((await repository.battleHistoryByToken('preview-league-battle-duel'))?.players).toHaveLength(2)
      expect(await product.practiceOpponentIds()).toEqual(['practice-opponent-1', 'practice-opponent-2'])
      const practiceCredentials = await database
        .select({ userId: authAccount.userId })
        .from(authAccount)
        .where(inArray(authAccount.userId, ['practice-opponent-1', 'practice-opponent-2']))
      expect(practiceCredentials).toEqual([])
    } finally {
      vi.unstubAllEnvs()
      const rows = await local.database.select({ id: user.id }).from(user)
      const product = new SpacetimeOperator(url!, databaseName!, token!)
      for (const row of rows) await product.deleteUserData(row.id)
      local.client.close()
      await rm(directory, { recursive: true, force: true })
    }
  },
)
