import { createHash } from 'node:crypto'
import { open, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getTableColumns, getTableName } from 'drizzle-orm'
import postgres from 'postgres'
import { schema } from '../../src/db/schema'
import { createPrivateExportDirectory } from './privateExportDirectory'
import { spacetimeSqlEndpoint } from './spacetimeSqlEndpoint'

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

const MAX_SPACETIME_QUERY_BYTES = 32_000_000
const MAX_SPACETIME_TABLE_ROWS = 10_000

async function boundedJson(response: Response) {
  if (!response.body) throw new Error('Empty SpacetimeDB SQL response')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_SPACETIME_QUERY_BYTES) throw new Error('SpacetimeDB product table exceeds the export size limit')
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function spacetimeRows(name: string, result: unknown): Record<string, unknown>[] {
  const table = Object.values(schema).find((candidate) => getTableName(candidate) === name)
  if (!table || !Array.isArray(result) || result.length !== 1) throw new Error(`Invalid SpacetimeDB query result in ${name}`)
  const data = result[0]
  if (!data || !Array.isArray(data.rows) || !Array.isArray(data.schema?.elements)) {
    throw new Error(`Invalid SpacetimeDB query result in ${name}`)
  }
  if (data.rows.length > MAX_SPACETIME_TABLE_ROWS) throw new Error(`SpacetimeDB product table exceeds the row limit in ${name}`)
  const columns = Object.values(getTableColumns(table))
  const names = data.schema.elements.map((element: { name?: { some?: unknown } }) => element.name?.some)
  const expected = columns.map((column) => column.name)
  if (productOrderColumns[name as keyof typeof productOrderColumns].length > 1) expected.push('key')
  if (
    names.some((field: unknown) => typeof field !== 'string') ||
    JSON.stringify((names as string[]).toSorted((left, right) => left.localeCompare(right))) !==
      JSON.stringify(expected.toSorted((left, right) => left.localeCompare(right)))
  ) {
    throw new Error(`SpacetimeDB column mismatch in ${name}`)
  }
  return data.rows.map((values: unknown) => {
    if (!Array.isArray(values) || values.length !== names.length) throw new Error(`Invalid SpacetimeDB row in ${name}`)
    const source = new Map(names.map((field: string, index: number) => [field, values[index]]))
    const row: Record<string, unknown> = {}
    for (const column of columns) {
      let value = source.get(column.name)
      if (!column.notNull) {
        if (!Array.isArray(value) || (value[0] !== 0 && value[0] !== 1)) {
          throw new Error(`Invalid SpacetimeDB option in ${name}`)
        }
        value = value[0] === 1 ? null : value[1]
      }
      row[column.name] = value
    }
    return row
  })
}

export async function exportSpacetimeProductBundle(
  baseUrl: string,
  database: string,
  token: string,
  destination: string,
  repositoryRoot: string,
  access?: { clientId: string; clientSecret: string },
): Promise<ProductExportManifest> {
  if (!token) throw new Error('SPACETIME_EXPORT_TOKEN is required')
  checkProductTableInventory()
  const endpoint = spacetimeSqlEndpoint(baseUrl, database)
  const directory = await createPrivateExportDirectory(destination, repositoryRoot)
  const tables: ProductExportManifest['tables'] = []
  for (const name of productTableNames) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'text/plain',
        ...(access ? { 'CF-Access-Client-Id': access.clientId, 'CF-Access-Client-Secret': access.clientSecret } : {}),
      },
      body: `SELECT * FROM "${name}"`,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`SpacetimeDB SQL request failed with HTTP ${response.status} in ${name}`)
    const rows = spacetimeRows(name, await boundedJson(response))
    const order = productOrderColumns[name as keyof typeof productOrderColumns]
    rows.sort((left, right) => JSON.stringify(order.map((key) => left[key])).localeCompare(JSON.stringify(order.map((key) => right[key]))))
    const bytes = rows.map(jsonLine).join('')
    await writeFile(join(directory, `${name}.jsonl`), bytes, { mode: 0o600, flag: 'wx' })
    tables.push({ name, count: rows.length, sha256: createHash('sha256').update(bytes).digest('hex') })
  }
  const manifest: ProductExportManifest = { version: 1, tables }
  await writeFile(join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
  return manifest
}
