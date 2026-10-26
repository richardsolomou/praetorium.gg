import { expect, type Page } from '@playwright/test'
import type { LocalState } from '../src/contracts/localState'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { spacetimeDatabaseUrl } from 'ras-stack/spacetime'
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

/** The guest roster draft this browser keeps, or an empty string when it keeps none. */
export const guestDraft = (page: Page) => page.evaluate(() => localStorage.getItem('praetorium.guest-draft') ?? '')

/** Waits until no saved work is left to send; a device that never saved any work does not pass. */
export async function expectWorkSynced(
  page: Page,
  { timeout, work = savedWork }: { timeout?: number; work?: (page: Page) => Promise<LocalState | null> } = {},
) {
  await expect.poll(async () => (await work(page))?.operations.length, { timeout }).toBe(0)
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

/** The id or token a page's address ends with. */
export const lastPathSegment = (url: string | URL) => new URL(url).pathname.split('/').at(-1)!

export async function userIdFor(email: string, directory = root) {
  const user = await withAuthSql(
    (database) => database.prepare('SELECT id FROM user WHERE email = ?').get(email) as { id: string } | undefined,
    directory,
  )
  if (!user) throw new Error(`No account exists for ${email}.`)
  return user.id
}

type RosterInput = Parameters<SpacetimeOperator['saveRoster']>[0]

/** Saves a private, editable roster straight into the account behind `email`. */
export async function seedRoster(
  email: string,
  roster: Omit<RosterInput, 'id' | 'userId' | 'prep' | 'tags' | 'waivedRules' | 'visibility' | 'source' | 'now'> & Partial<RosterInput>,
) {
  const operator = await productOperator()
  const id = roster.id ?? crypto.randomUUID()
  const outcome = await operator.saveRoster({
    id,
    userId: await userIdFor(email),
    prep: null,
    tags: '[]',
    waivedRules: '[]',
    visibility: 'private',
    source: 'editable',
    now: Date.now(),
    ...roster,
  })
  return { id, operator, outcome }
}

export async function userIdNamed(name: string, directory = root) {
  const user = await withAuthSql(
    (database) => database.prepare('SELECT id FROM user WHERE name = ?').get(name) as { id: string } | undefined,
    directory,
  )
  if (!user) throw new Error(`No account is named ${name}.`)
  return user.id
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
  const endpoint = spacetimeDatabaseUrl({ url: `http://127.0.0.1:${spacetimePort}`, database: `praetorium-local-${port}` }, '/sql')
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

export async function battleIdFor(token: string) {
  const [battle] = await productSql<{ id: string }>`SELECT id FROM battles WHERE token = ${token}`
  if (!battle) throw new Error(`No battle has the token ${token}.`)
  return battle.id
}

/** The battle's seated players, in side order. */
export async function seatsBySide(battleId: string) {
  const seats = await productSql<{ user_id: string; side: number }>`SELECT user_id, side FROM battle_users WHERE battle_id = ${battleId}`
  return seats.toSorted((left, right) => left.side - right.side).map((seat) => seat.user_id)
}

/** Appends a command after whatever the log ends on now: an open battle page can still be writing its own. */
export async function appendCommand(battleId: string, by: string, body: object) {
  const seq =
    Math.max(...(await productSql<{ seq: number }>`SELECT seq FROM commands WHERE battle_id = ${battleId}`).map((row) => row.seq)) + 1
  await productSql`INSERT INTO commands (key, battle_id, seq, user_id, at, body) VALUES (${JSON.stringify([battleId, seq])}, ${battleId}, ${seq}, ${by}, ${Date.now() + seq}, ${JSON.stringify(body)})`
}

/** Appends commands to the open battle's log, for journeys that only need to reach a later state. */
export async function battleLog(page: Page) {
  const id = await battleIdFor(lastPathSegment(page.url()))
  const commands = await productSql<{ body: string }>`SELECT body FROM commands WHERE battle_id = ${id}`
  const begun = commands
    .map((command) => JSON.parse(command.body) as { kind: string; firstPlayerId?: string })
    .find((body) => body.kind === 'begin-battle')
  if (!begun?.firstPlayerId) throw new Error('Battle did not start')
  const [second] = await productSql<{
    user_id: string
  }>`SELECT user_id FROM battle_users WHERE battle_id = ${id} AND user_id <> ${begun.firstPlayerId}`
  if (!second) throw new Error('Battle seats are incomplete')
  return {
    id,
    first: begun.firstPlayerId,
    second: second.user_id,
    append: (by: string, body: object) => appendCommand(id, by, body),
  }
}
