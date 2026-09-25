import { fileURLToPath } from 'node:url'
import { databaseUrl, openDatabase } from '../src/db/connection'
import { exportAuthSql } from './lib/authExport'
import { existingAuthSecret } from './lib/authSecret'
import { writeAuthBundle } from './lib/authBundle'

const output = process.argv[2]
if (!output) throw new Error('usage: pnpm auth:export /absolute/path/new-directory')

const connection = openDatabase(databaseUrl())
try {
  const sql = await exportAuthSql(connection.database)
  const secret = await existingAuthSecret()
  await writeAuthBundle(output, sql, secret, fileURLToPath(new URL('../', import.meta.url)))
  console.log(`Wrote auth export to ${output}`)
} finally {
  await connection.close()
}
