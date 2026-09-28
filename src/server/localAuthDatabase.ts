import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { statSync } from 'node:fs'
import path from 'node:path'
import { schema } from '../db/authSchema'

export function localAuthDatabase(file: string) {
  if (!path.isAbsolute(file)) throw new Error('AUTH_SQLITE_PATH must be absolute')
  if (!statSync(file).isFile()) throw new Error('AUTH_SQLITE_PATH must name a file')
  const client = createClient({ url: `file:${file}`, timeout: 5_000, concurrency: 1 })
  return { client, database: drizzle(client, { schema }) }
}
