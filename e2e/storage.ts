import type { Page } from '@playwright/test'
import type { LocalState } from '../src/contracts/localState'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { spacetimeSqlEndpoint } from '../scripts/lib/spacetimeSqlEndpoint'
import { SpacetimeOperator } from '../src/server/spacetimeOperator'
import { port, root, spacetimePort } from './stackEnv'

export async function savedWork(page: Page) {
  return page.evaluate(
    () =>
      new Promise<LocalState | null>((resolve, reject) => {
        const opened = indexedDB.open('praetorium-work')
        opened.onerror = () => reject(opened.error)
        opened.onsuccess = () => {
          const database = opened.result
          const request = database.transaction('state').objectStore('state').getAll()
          request.onerror = () => {
            database.close()
            reject(request.error)
          }
          request.onsuccess = () => {
            database.close()
            resolve(request.result.find((entry: { state?: LocalState }) => entry.state)?.state ?? null)
          }
        }
      }),
  )
}
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

/** Appends commands to the open battle's log, for journeys that only need to reach a later state. */
export async function battleLog(page: Page) {
  const token = new URL(page.url()).pathname.split('/').at(-1)!
  const [battle] = await productSql<{ id: string }>`SELECT id FROM battles WHERE token = ${token}`
  if (!battle) throw new Error('Battle not found')
  const commands = await productSql<{ seq: number; body: string }>`SELECT seq, body FROM commands WHERE battle_id = ${battle.id}`
  const begun = commands
    .map((command) => JSON.parse(command.body) as { kind: string; firstPlayerId?: string })
    .find((body) => body.kind === 'begin-battle')
  if (!begun?.firstPlayerId) throw new Error('Battle did not start')
  const [second] = await productSql<{
    user_id: string
  }>`SELECT user_id FROM battle_users WHERE battle_id = ${battle.id} AND user_id <> ${begun.firstPlayerId}`
  if (!second) throw new Error('Battle seats are incomplete')
  let seq = Math.max(...commands.map((command) => command.seq))
  return {
    id: battle.id,
    first: begun.firstPlayerId,
    second: second.user_id,
    append: async (by: string, body: object) => {
      seq += 1
      await productSql`INSERT INTO commands (key, battle_id, seq, user_id, at, body) VALUES (${JSON.stringify([battle.id, seq])}, ${battle.id}, ${seq}, ${by}, ${Date.now() + seq}, ${JSON.stringify(body)})`
    },
  }
}
