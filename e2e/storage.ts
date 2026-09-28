import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { spacetimeSqlEndpoint } from '../scripts/lib/spacetimeSqlEndpoint'
import { SpacetimeOperator } from '../src/server/spacetimeOperator'
import { port, root, spacetimePort } from './stackEnv'

type Value = string | number | boolean | null
type SqlResult = {
  schema: { elements: { name: { some?: string } }[] }
  rows: unknown[][]
}

async function productCredentials() {
  return JSON.parse(await readFile(path.join(root, 'credentials.json'), 'utf8')) as {
    owner: { token: string }
    operator: { token: string }
  }
}

export async function productOperator() {
  const credentials = await productCredentials()
  return new SpacetimeOperator(`http://127.0.0.1:${spacetimePort}`, `praetorium-local-${port}`, credentials.operator.token)
}

export async function withAuthSql<T>(work: (database: DatabaseSync) => T, directory = root): Promise<T> {
  const database = new DatabaseSync(path.join(directory, 'auth.sqlite'), { timeout: 5_000 })
  try {
    return work(database)
  } finally {
    database.close()
  }
}

function literal(value: Value): string {
  if (value === null) return 'NULL'
  if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (!Number.isFinite(value)) throw new Error('Invalid product SQL value')
  return String(value)
}

export async function productSql<T extends Record<string, unknown> = Record<string, unknown>>(
  parts: TemplateStringsArray,
  ...values: Value[]
): Promise<T[]> {
  const query = parts.reduce((text, part, index) => text + (index ? literal(values[index - 1]) : '') + part, '')
  const credentials = await productCredentials()
  const endpoint = spacetimeSqlEndpoint(`http://127.0.0.1:${spacetimePort}`, `praetorium-local-${port}`)
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${credentials.owner.token}`, 'content-type': 'text/plain' },
    body: query,
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Local SpacetimeDB SQL failed with HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`)
  const results = (await response.json()) as SqlResult[]
  if (!Array.isArray(results) || results.length !== 1) throw new Error('Invalid local SpacetimeDB SQL result')
  const columns = results[0].schema.elements.map((entry) => entry.name.some)
  if (columns.some((name) => !name)) throw new Error('Local SpacetimeDB SQL query needs named columns')
  return results[0].rows.map((row) => Object.fromEntries(columns.map((name, index) => [name, row[index]])))
}
