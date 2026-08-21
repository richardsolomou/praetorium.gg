import postgres from 'postgres'
import { assertPreviewDatabase, databaseNameFrom, previewDatabaseName } from './previewEnv'

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
export async function resetPreviewDatabase(adminUrl: string, databaseUrl: string, live: readonly string[] = []) {
  const name = assertPreviewDatabase(databaseNameFrom(databaseUrl))
  const admin = postgres(adminUrl, { max: 1, onnotice: () => undefined })
  try {
    // FORCE, because the previous deployment's container may still be connected.
    await admin.unsafe(`drop database if exists "${name}" with (force)`)
    await admin.unsafe(`create database "${name}"`)
    return { database: name, dropped: await dropClosedPreviews(admin, live) }
  } finally {
    await admin.end({ timeout: 5 })
  }
}

/**
 * Drops the databases of pull requests that have closed.
 *
 * An empty list means the caller could not say what is still open, and the answer
 * to not knowing is to leave everything alone. Only names this file would itself
 * have created are considered, so nothing outside `praetorium_pr_<number>` is ever
 * a candidate.
 */
async function dropClosedPreviews(admin: postgres.Sql, live: readonly string[]) {
  if (!live.length) return []
  const keep = new Set(live.map((prNumber) => previewDatabaseName(prNumber)))
  const rows = await admin<{ datname: string }[]>`
    select datname from pg_database where datname like 'praetorium_pr_%'
  `
  const dropped: string[] = []
  for (const { datname } of rows) {
    if (keep.has(datname)) continue
    // Belt and braces: the pattern above is a LIKE, this is the real rule.
    if (!/^praetorium_pr_\d+$/.test(datname)) continue
    await admin.unsafe(`drop database if exists "${assertPreviewDatabase(datname)}" with (force)`)
    dropped.push(datname)
  }
  return dropped
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const adminUrl = process.env.PRAETORIUM_PREVIEW_ADMIN_DATABASE_URL?.trim()
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!adminUrl) throw new Error('PRAETORIUM_PREVIEW_ADMIN_DATABASE_URL is not set')
  if (!databaseUrl) throw new Error('DATABASE_URL is not set')
  const live = (process.env.PRAETORIUM_PREVIEW_LIVE_PR_NUMBERS ?? '').split(/\s+/).filter(Boolean)
  const { database, dropped } = await resetPreviewDatabase(adminUrl, databaseUrl, live)
  console.log({ event: 'preview_database_reset', database, droppedClosed: dropped })
}
