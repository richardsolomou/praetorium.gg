import { readFile, readdir } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'

const tables = ['user', 'account', 'session', 'verification', 'twoFactor', 'rateLimit', 'jwks'] as const

export async function verifyAuthBundle(directory: string, migrationsDirectory: string) {
  const secret = await readFile(join(directory, 'auth.secret'), 'utf8')
  if (secret.trim().length < 32) throw new Error('auth.secret is missing or too short')

  const migrations = (await readdir(migrationsDirectory)).filter((file) => /^\d+_.+\.sql$/.test(file)).sort()
  if (migrations.length === 0) throw new Error('No D1 auth migrations found')

  const database = new DatabaseSync(':memory:')
  try {
    database.exec('PRAGMA foreign_keys = ON')
    for (const migration of migrations) database.exec(await readFile(join(migrationsDirectory, migration), 'utf8'))
    database.exec(await readFile(join(directory, 'auth.sql'), 'utf8'))
    if (database.prepare('PRAGMA foreign_key_check').all().length !== 0) throw new Error('Auth export has broken foreign keys')

    return Object.fromEntries(
      tables.map((table) => [table, (database.prepare(`SELECT count(*) AS count FROM "${table}"`).get() as { count: number }).count]),
    ) as Record<(typeof tables)[number], number>
  } finally {
    database.close()
  }
}
