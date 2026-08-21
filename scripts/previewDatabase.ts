import postgres from 'postgres'
import { assertPreviewDatabase, databaseNameFrom } from './previewEnv'

/**
 * Gives this preview an empty database of its own, before anything migrates.
 *
 * Runs inside the container because the preview Postgres is reachable from
 * Dokploy's network and not from a CI runner. Dropping first is what makes
 * "every deployment starts empty" true: the database outlives the container, so
 * without this a preview would accumulate battles across deployments.
 *
 * The name is checked rather than trusted. It is interpolated into DDL, which
 * cannot take parameters, so `assertPreviewDatabase` is the thing standing
 * between a malformed variable and somebody's real database.
 */
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const adminUrl = process.env.PRAETORIUM_PREVIEW_ADMIN_DATABASE_URL?.trim()
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!adminUrl) throw new Error('PRAETORIUM_PREVIEW_ADMIN_DATABASE_URL is not set')
  if (!databaseUrl) throw new Error('DATABASE_URL is not set')
  const name = await resetPreviewDatabase(adminUrl, databaseUrl)
  console.log({ event: 'preview_database_reset', database: name })
}
