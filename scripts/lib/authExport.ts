import { asc } from 'drizzle-orm'
import type { PraetoriumDatabase } from '../../src/db/connection'
import { account, rateLimit, session, twoFactor, user, verification } from '../../src/db/schema'

type AuthTable = 'user' | 'session' | 'account' | 'verification' | 'twoFactor' | 'rateLimit'
type AuthRows = Record<AuthTable, Record<string, unknown>[]>

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (value instanceof Date) return String(value.getTime())
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
  if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`
  throw new Error('Unsupported auth column value')
}

function insert(table: AuthTable, row: Record<string, unknown>): string {
  const columns = Object.keys(row)
  const names = columns.map((column) => `"${column}"`).join(', ')
  const values = columns.map((column) => sqlLiteral(row[column])).join(', ')
  return `INSERT INTO "${table}" (${names}) VALUES (${values});`
}

export async function exportAuthSql(database: PraetoriumDatabase): Promise<string> {
  const rows: AuthRows = await database.transaction(
    async (tx) => ({
      user: await tx.select().from(user).orderBy(asc(user.id)),
      session: await tx.select().from(session).orderBy(asc(session.id)),
      account: await tx.select().from(account).orderBy(asc(account.id)),
      verification: await tx.select().from(verification).orderBy(asc(verification.id)),
      twoFactor: await tx.select().from(twoFactor).orderBy(asc(twoFactor.id)),
      rateLimit: await tx.select().from(rateLimit).orderBy(asc(rateLimit.id)),
    }),
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  )
  const order: AuthTable[] = ['user', 'account', 'session', 'verification', 'twoFactor', 'rateLimit']
  return `${order.flatMap((table) => rows[table].map((row) => insert(table, row))).join('\n')}\n`
}
