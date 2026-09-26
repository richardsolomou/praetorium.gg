import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { verifyAuthBundle } from './verifyAuthBundle'

const migrations = fileURLToPath(new URL('../../drizzle-auth/', import.meta.url))
const secret = 'a'.repeat(32)

it('imports the auth bundle with foreign keys enabled and reports table counts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'praetorium-auth-verify-'))
  try {
    await writeFile(join(directory, 'auth.secret'), secret)
    await writeFile(
      join(directory, 'auth.sql'),
      "INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('u1', 'Player', 'player@example.com', 1, 1, 1);\n",
    )

    expect(await verifyAuthBundle(directory, migrations)).toEqual({
      user: 1,
      account: 0,
      session: 0,
      verification: 0,
      twoFactor: 0,
      rateLimit: 0,
      jwks: 0,
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('rejects an auth export with a session for a missing user', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'praetorium-auth-verify-'))
  try {
    await writeFile(join(directory, 'auth.secret'), secret)
    await writeFile(
      join(directory, 'auth.sql'),
      "INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES ('s1', 1, 'token', 1, 1, 'missing');\n",
    )

    await expect(verifyAuthBundle(directory, migrations)).rejects.toThrow('FOREIGN KEY constraint failed')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('refuses a bundle without the existing signing secret', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'praetorium-auth-verify-'))
  try {
    await writeFile(join(directory, 'auth.secret'), 'too short')
    await writeFile(join(directory, 'auth.sql'), '')

    await expect(verifyAuthBundle(directory, migrations)).rejects.toThrow('auth.secret is missing or too short')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('requires D1 migrations before checking imported rows', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'praetorium-auth-verify-'))
  try {
    const empty = join(directory, 'migrations')
    await mkdir(empty)
    await writeFile(join(directory, 'auth.secret'), secret)
    await writeFile(join(directory, 'auth.sql'), '')

    await expect(verifyAuthBundle(directory, empty)).rejects.toThrow('No D1 auth migrations found')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
