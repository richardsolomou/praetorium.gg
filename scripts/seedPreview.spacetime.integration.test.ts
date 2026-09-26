import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { getPlatformProxy } from 'wrangler'
import { expect, it, vi } from 'vitest'
import type { Roster } from '../src/core/battle'
import { schema, user } from '../src/db/d1AuthSchema'
import { handleD1Bridge } from '../src/server/d1Bridge'
import { D1AccountRepository } from '../src/server/d1AccountRepository'
import { SpacetimeOperator } from '../src/server/spacetimeOperator'
import { SpacetimeRepository } from '../src/server/spacetimeRepository'
import { PREVIEW_ACCOUNTS, PREVIEW_EMAIL, seedPreview } from './seedPreview'

const url = process.env.SPACETIME_TEST_URL
const databaseName = process.env.SPACETIME_TEST_DATABASE
const token = process.env.SPACETIME_TEST_OPERATOR_TOKEN

it.skipIf(!url || !databaseName || !token)(
  'seeds an isolated D1 and SpacetimeDB preview twice without duplicate product data',
  { timeout: 30_000 },
  async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'praetorium-preview-spacetime-'))
    const configPath = path.join(directory, 'wrangler.jsonc')
    await writeFile(
      configPath,
      JSON.stringify({
        name: 'praetorium-preview-spacetime-test',
        main: 'index.js',
        compatibility_date: '2026-09-17',
        d1_databases: [{ binding: 'AUTH_DB', database_name: 'praetorium-preview-spacetime-test', database_id: randomUUID() }],
      }),
    )
    const proxy = await getPlatformProxy<{ AUTH_DB: Parameters<typeof drizzle>[0] }>({ configPath, persist: false, envFiles: [] })
    const originalFetch = globalThis.fetch
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
      const migration = await readFile(path.resolve('drizzle-auth/0000_curly_gambit.sql'), 'utf8')
      for (const statement of migration.split('--> statement-breakpoint')) {
        if (statement.trim()) await proxy.env.AUTH_DB.prepare(statement).run()
      }
      vi.stubEnv('SPACETIME_URL', url)
      vi.stubEnv('SPACETIME_DATABASE', databaseName)
      vi.stubEnv('SPACETIME_OPERATOR_TOKEN', token)
      vi.stubEnv('APP_URL', 'http://127.0.0.1:8799')
      vi.stubEnv('SPACETIME_AUDIENCE', 'praetorium-auth-proof')
      vi.stubEnv('AUTH_SECRET', 'praetorium-disposable-preview-secret')
      vi.stubEnv('AUTH_RATE_LIMIT', 'off')
      vi.stubEnv('PRAETORIUM_SEED_PREVIEW', 'true')
      vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init)
        return new URL(request.url).hostname === 'd1.internal' ? handleD1Bridge(request, proxy.env.AUTH_DB) : originalFetch(input, init)
      })
      await seedPreview(undefined, snapshots)
      await seedPreview(undefined, snapshots)
      const accounts = new D1AccountRepository(proxy.env.AUTH_DB)
      const product = new SpacetimeOperator(url!, databaseName!, token!)
      const repository = new SpacetimeRepository(accounts, product)
      const [preview] = await drizzle(proxy.env.AUTH_DB, { schema }).select({ id: user.id }).from(user).where(eq(user.email, PREVIEW_EMAIL))
      if (!preview) throw new Error('Preview account missing')
      expect((await repository.adminUsers({ limit: 10 })).users.find((row) => row.id === preview.id)?.rosterCount).toBe(8)
      expect((await repository.leagueByToken('preview-league-doubles', preview.id))?.entries).toHaveLength(4)
      expect((await repository.battleHistoryByToken('preview-league-battle-duel'))?.players).toHaveLength(2)
    } finally {
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
      const database = drizzle(proxy.env.AUTH_DB, { schema })
      const rows = await database.select({ id: user.id }).from(user)
      const product = new SpacetimeOperator(url!, databaseName!, token!)
      for (const row of rows) await product.deleteUserData(row.id)
      await proxy.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  },
)
