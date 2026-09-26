import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { getTableColumns, getTableName } from 'drizzle-orm'
import { z } from 'zod'
import { schema } from '../../src/db/schema'
import { PRODUCT_ROW_MAX_BYTES, productOrderColumns, productTableNames, type ProductExportManifest } from './productExport'

const manifestSchema = z.strictObject({
  version: z.literal(1),
  tables: z.array(
    z.strictObject({
      name: z.string(),
      count: z.number().int().nonnegative(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
    }),
  ),
})

const tables: Map<string, (typeof schema)[keyof typeof schema]> = new Map(
  Object.values(schema).map((table) => [getTableName(table), table]),
)
const productNames = new Set<string>(productTableNames)
const MAX_CALL_BYTES = 2_200_000

function columnsFor(name: string) {
  const table = tables.get(name)
  if (!table || !productNames.has(name)) throw new Error(`Unknown product table: ${name}`)
  return Object.values(getTableColumns(table))
}

function validateRow(name: string, row: unknown): asserts row is Record<string, unknown> {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Invalid row in ${name}`)
  const columns = columnsFor(name)
  const expected = columns.map((column) => column.name).sort((left, right) => left.localeCompare(right))
  const actual = Object.keys(row).sort((left, right) => left.localeCompare(right))
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Column mismatch in ${name}`)
  for (const column of columns) {
    const value = (row as Record<string, unknown>)[column.name]
    if (value === null) {
      if (column.notNull) throw new Error(`Null ${column.name} in ${name}`)
      continue
    }
    if (column.dataType === 'string' && typeof value === 'string') continue
    if (column.dataType === 'boolean' && typeof value === 'boolean') continue
    if (column.dataType === 'number') {
      const integer =
        typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
          ? BigInt(value)
          : typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value)
            ? BigInt(value)
            : undefined
      const limit = column.getSQLType() === 'integer' ? 2_147_483_647n : BigInt(Number.MAX_SAFE_INTEGER)
      if (integer !== undefined && integer <= limit) continue
    }
    throw new Error(`Invalid ${column.name} in ${name}`)
  }
}

async function scanRows(name: string, path: string, onRow?: (row: Record<string, unknown>) => Promise<void>) {
  const hash = createHash('sha256')
  let pending = Buffer.alloc(0)
  let count = 0
  for await (const chunk of createReadStream(path, { highWaterMark: 64 * 1024 })) {
    hash.update(chunk)
    const bytes = Buffer.concat([pending, chunk])
    let start = 0
    while (true) {
      const end = bytes.indexOf(10, start)
      if (end === -1) break
      const line = bytes.subarray(start, end)
      if (line.length === 0 || line.length > PRODUCT_ROW_MAX_BYTES) throw new Error(`Invalid row length in ${name}`)
      const row: unknown = JSON.parse(line.toString('utf8'))
      validateRow(name, row)
      if (onRow) await onRow(row)
      count += 1
      start = end + 1
    }
    pending = bytes.subarray(start)
    if (pending.length > PRODUCT_ROW_MAX_BYTES) throw new Error(`Invalid row length in ${name}`)
  }
  if (pending.length) throw new Error(`Missing final newline in ${name}`)
  return { count, sha256: hash.digest('hex') }
}

export async function verifyProductBundle(directory: string): Promise<ProductExportManifest> {
  const manifestFile = join(directory, 'manifest.json')
  if ((await stat(manifestFile)).size > 64_000) throw new Error('Product export manifest is too large')
  const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestFile, 'utf8')))
  if (JSON.stringify(manifest.tables.map((table) => table.name)) !== JSON.stringify(productTableNames)) {
    throw new Error('Product export table inventory differs from the Postgres schema')
  }
  for (const table of manifest.tables) {
    const actual = await scanRows(table.name, join(directory, `${table.name}.jsonl`))
    if (actual.count !== table.count || actual.sha256 !== table.sha256) throw new Error(`Product export mismatch in ${table.name}`)
  }
  return manifest
}

function importRows(name: string, rows: Record<string, unknown>[]) {
  const keyColumns = productOrderColumns[name as keyof typeof productOrderColumns]
  return JSON.stringify(
    rows.map((row) => (keyColumns.length > 1 ? { key: JSON.stringify(keyColumns.map((column) => row[column])), ...row } : row)),
  )
}

function primaryKey(name: string, row: Record<string, unknown>) {
  const columns = productOrderColumns[name as keyof typeof productOrderColumns]
  return columns.length > 1
    ? { column: 'key', value: JSON.stringify(columns.map((column) => row[column])) }
    : { column: columns[0], value: row[columns[0]] }
}

function stringLiteral(value: unknown) {
  if (typeof value !== 'string') throw new Error('Invalid product primary key')
  return `'${value.replaceAll("'", "''")}'`
}

function numericValue(value: unknown) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value)
  if (typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value)) return BigInt(value)
  return null
}

function sqlEndpoint(baseUrl: string, database: string) {
  const base = new URL(baseUrl)
  const local = base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname)
  if ((!local && base.protocol !== 'https:') || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new Error('Invalid SpacetimeDB URL')
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(database)) throw new Error('Invalid SpacetimeDB database name')
  return new URL(`/v1/database/${database}/sql`, base)
}

export async function importProductBundle(
  directory: string,
  baseUrl: string,
  database: string,
  token: string,
  access?: { clientId: string; clientSecret: string },
) {
  if (!token) throw new Error('SPACETIME_IMPORT_TOKEN is required')
  const endpoint = sqlEndpoint(baseUrl, database)
  const manifest = await verifyProductBundle(directory)
  const accessHeaders: Record<string, string> = access
    ? { 'CF-Access-Client-Id': access.clientId, 'CF-Access-Client-Secret': access.clientSecret }
    : {}
  const query = async (statement: string) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { ...accessHeaders, authorization: `Bearer ${token}`, 'content-type': 'text/plain' },
      body: statement,
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(`SpacetimeDB SQL request failed with HTTP ${response.status}`)
    return response.json() as Promise<
      {
        schema: { elements: { name: { some: string } }[] }
        rows: unknown[][]
      }[]
    >
  }
  const importBatch = async (name: string, rows: Record<string, unknown>[]) => {
    const body = JSON.stringify([name, importRows(name, rows)])
    if (Buffer.byteLength(body) > MAX_CALL_BYTES) throw new Error(`Product import batch exceeds the call size limit in ${name}`)
    const response = await fetch(new URL(`/v1/database/${database}/call/import_product_batch`, endpoint), {
      method: 'POST',
      headers: { ...accessHeaders, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(`SpacetimeDB reducer request failed with HTTP ${response.status}`)
  }
  const countRows = async (name: string) => {
    const result = await query(`SELECT COUNT(*) AS count FROM "${name}"`)
    const count = result[0]?.rows[0]?.[0]
    if (typeof count !== 'number' || !Number.isSafeInteger(count)) throw new Error(`Invalid SpacetimeDB count for ${name}`)
    return count
  }
  const readRow = async (name: string, row: Record<string, unknown>) => {
    const key = primaryKey(name, row)
    const result = await query(`SELECT * FROM "${name}" WHERE "${key.column}" = ${stringLiteral(key.value)}`)
    const data = result[0]
    if (!data || data.rows.length > 1) throw new Error(`Invalid SpacetimeDB row in ${name}`)
    const found = data.rows[0]
    if (!found) return false
    const actual = new Map(data.schema.elements.map((element, index) => [element.name.some, found[index]]))
    const columns = columnsFor(name)
    if (actual.size !== columns.length + (key.column === 'key' ? 1 : 0)) throw new Error(`SpacetimeDB column mismatch in ${name}`)
    for (const column of columns) {
      let value = actual.get(column.name)
      if (!column.notNull) {
        if (!Array.isArray(value) || (value[0] !== 0 && value[0] !== 1)) throw new Error(`Invalid SpacetimeDB option in ${name}`)
        value = value[0] === 1 ? null : value[1]
      }
      const expected = row[column.name]
      if (column.dataType === 'number' && value !== null && expected !== null) {
        const number = numericValue(value)
        if (number === null || number !== numericValue(expected)) throw new Error(`SpacetimeDB row mismatch in ${name}`)
      } else if (value !== expected) {
        throw new Error(`SpacetimeDB row mismatch in ${name}`)
      }
    }
    return true
  }
  for (const table of manifest.tables) {
    const existing = await countRows(table.name)
    if (existing > table.count) throw new Error(`SpacetimeDB product table has extra rows: ${table.name}`)
    let batch: Record<string, unknown>[] = []
    let size = 0
    const flush = async () => {
      if (!batch.length) return
      try {
        await importBatch(table.name, batch)
      } catch (error) {
        throw new Error(`Product import failed in ${table.name}`, { cause: error })
      }
      batch = []
      size = 0
    }
    await scanRows(table.name, join(directory, `${table.name}.jsonl`), async (row) => {
      if (existing && (await readRow(table.name, row))) return
      const rowSize = Buffer.byteLength(JSON.stringify(row)) * 2 + 1000
      if (rowSize > MAX_CALL_BYTES) throw new Error(`Product row exceeds the call size limit in ${table.name}`)
      if (batch.length && (batch.length >= 100 || size + rowSize > MAX_CALL_BYTES)) await flush()
      batch.push(row)
      size += rowSize
    })
    await flush()
    if ((await countRows(table.name)) !== table.count) throw new Error(`SpacetimeDB import count mismatch in ${table.name}`)
    await scanRows(table.name, join(directory, `${table.name}.jsonl`), async (row) => {
      if (!(await readRow(table.name, row))) throw new Error(`SpacetimeDB row missing in ${table.name}`)
    })
  }
  return manifest
}
