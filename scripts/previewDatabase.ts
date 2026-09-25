import postgres from 'postgres'
import { assertPreviewDatabase, databaseNameFrom } from './previewEnv'

/** Reset the persistent preview database from inside its network before migration. Validate its name before interpolating it into DDL. */
export async function resetPreviewDatabase(adminUrl: string, databaseUrl: string) {
  const name = assertPreviewDatabase(databaseNameFrom(databaseUrl))
  const admin = postgres(adminUrl, { max: 1, onnotice: () => undefined })
  try {
    // FORCE, because the previous deployment's container may still be connected.
    await admin.unsafe(`drop database if exists "${name}" with (force)`)
    await admin.unsafe(`create database "${name}"`)
    return name
  } finally {
    await admin.end({ timeout: 5 })
  }
}

// An entrypoint, not a library: a main block runs inside any bundle that includes
// the file, because esbuild gives every module the entrypoint's `import.meta.url`.
if (import.meta.url === `file://${process.argv[1]}`) {
  const adminUrl = process.env.PRAETORIUM_PREVIEW_ADMIN_DATABASE_URL?.trim()
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!adminUrl) throw new Error('PRAETORIUM_PREVIEW_ADMIN_DATABASE_URL is not set')
  if (!databaseUrl) throw new Error('DATABASE_URL is not set')
  const database = await resetPreviewDatabase(adminUrl, databaseUrl)
  console.log({ event: 'preview_database_reset', database })
}
