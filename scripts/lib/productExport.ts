import { createHash } from 'node:crypto'
import { open, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getTableName } from 'drizzle-orm'
import postgres from 'postgres'
import { schema } from '../../src/db/schema'
import { createPrivateExportDirectory } from './privateExportDirectory'

const authTables = new Set(['user', 'session', 'account', 'verification', 'twoFactor', 'rateLimit'])
export const productOrderColumns = {
  user_onboarding: ['user_id'],
  user_onboarding_tasks: ['user_id', 'task'],
  battles: ['id'],
  battle_users: ['battle_id', 'user_id'],
  battle_sharing: ['user_id'],
  push_preferences: ['user_id'],
  push_tokens: ['token'],
  friendships: ['requester_id', 'addressee_id'],
  friend_invites: ['token'],
  commands: ['battle_id', 'seq'],
  rosters: ['id'],
  leagues: ['id'],
  league_events: ['id'],
  league_event_entries: ['event_id', 'user_id'],
  league_event_battles: ['battle_id'],
  collection: ['user_id', 'entry_id'],
  favourite_factions: ['user_id', 'catalogue_id'],
  favourite_detachments: ['user_id', 'catalogue_id', 'detachment_id'],
  practice_opponents: ['user_id'],
} as const

export const PRODUCT_ROW_MAX_BYTES = 1_000_000

export const productTableNames = Object.values(schema)
  .map(getTableName)
  .filter((name) => !authTables.has(name))

export function checkProductTableInventory() {
  const expected = Object.keys(productOrderColumns).sort()
  const actual = [...productTableNames].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error('Product export table inventory differs from the Postgres schema')
}

function exportQuery(name: string) {
  const columns = productOrderColumns[name as keyof typeof productOrderColumns]
  if (!columns || !/^[a-z_]+$/.test(name) || columns.some((column) => !/^[a-z_]+$/.test(column))) {
    throw new Error(`Invalid product export table: ${name}`)
  }
  return `SELECT * FROM "${name}" ORDER BY ${columns.map((column) => `"${column}"`).join(', ')}`
}

function jsonLine(row: Record<string, unknown>) {
  const line = `${JSON.stringify(row, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value))}\n`
  if (Buffer.byteLength(line) > PRODUCT_ROW_MAX_BYTES) throw new Error('Product row exceeds the 1 MB export limit')
  return line
}

export type ProductExportManifest = {
  version: 1
  tables: { name: string; count: number; sha256: string }[]
}

export async function exportProductBundle(url: string, destination: string, repositoryRoot: string): Promise<ProductExportManifest> {
  checkProductTableInventory()
  const directory = await createPrivateExportDirectory(destination, repositoryRoot)
  const client = postgres(url, { max: 1, connect_timeout: 10 })
  try {
    const tables = await client.begin('isolation level repeatable read read only', async (transaction) => {
      const results: ProductExportManifest['tables'] = []
      for (const name of productTableNames) {
        const hash = createHash('sha256')
        const file = await open(join(directory, `${name}.jsonl`), 'wx', 0o600)
        let count = 0
        try {
          for await (const rows of transaction.unsafe(exportQuery(name)).cursor(500)) {
            const chunk = (rows as Record<string, unknown>[]).map(jsonLine).join('')
            hash.update(chunk)
            await file.writeFile(chunk)
            count += rows.length
          }
        } finally {
          await file.close()
        }
        results.push({ name, count, sha256: hash.digest('hex') })
      }
      return results
    })
    const manifest: ProductExportManifest = { version: 1, tables }
    await writeFile(join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    return manifest
  } finally {
    await client.end()
  }
}
