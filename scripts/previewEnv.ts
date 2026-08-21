/**
 * The environment a preview application runs with, and the database it owns.
 *
 * Composed here rather than in `preview-deploy.yml` because it carries a Postgres
 * URL, and that file is public. The credential arrives in `PREVIEW_APP_SECRETS`
 * and never lands in the repository.
 */
type Source = Record<string, string | undefined>

/** Only what a preview is allowed to be told. An unknown key is a mistake, not a passthrough. */
const previewSecretNames = new Set(['PREVIEW_DATABASE_ADMIN_URL'])

export function loadPreviewAppSecrets(source: Source = process.env, target: Source = process.env) {
  const serialized = source.PREVIEW_APP_SECRETS?.trim()
  if (!serialized) return
  const parsed: unknown = JSON.parse(serialized)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('PREVIEW_APP_SECRETS must be a JSON object')
  for (const [name, secret] of Object.entries(parsed)) {
    if (!previewSecretNames.has(name)) throw new Error(`PREVIEW_APP_SECRETS contains unsupported key ${name}`)
    if (typeof secret !== 'string') throw new Error(`PREVIEW_APP_SECRETS.${name} must be a string`)
    target[name] = secret
  }
}

function value(source: Source, name: string) {
  return source[name]?.trim() || undefined
}

function required(source: Source, name: string) {
  const found = value(source, name)
  if (!found) throw new Error(`${name} is required`)
  return found
}

export function pullRequestNumber(candidate: string | undefined) {
  const trimmed = candidate?.trim()
  if (!trimmed || !/^\d+$/.test(trimmed)) throw new Error('PR_NUMBER must be a pull request number')
  return trimmed
}

/**
 * The one database a preview may touch.
 *
 * Named from the pull request and nothing else, so the reset that runs on every
 * deployment cannot resolve to a database somebody cares about.
 */
export function previewDatabaseName(prNumber: string) {
  return `praetorium_pr_${pullRequestNumber(prNumber)}`
}

/** Refuses anything that is not a preview database, whatever produced the name. */
export function assertPreviewDatabase(name: string) {
  if (!/^praetorium_pr_\d+$/.test(name)) throw new Error(`${name} is not a preview database`)
  return name
}

/** The admin connection with its database swapped for this preview's own. */
export function previewDatabaseUrl(adminUrl: string, prNumber: string) {
  const url = new URL(adminUrl)
  url.pathname = `/${previewDatabaseName(prNumber)}`
  return url.toString()
}

/** The database a connection string points at, for the container to check its own target. */
export function databaseNameFrom(url: string) {
  return new URL(url).pathname.replace(/^\//, '')
}

export function previewEnv(prNumber: string, previewUrl: string, source: Source = process.env) {
  const admin = required(source, 'PREVIEW_DATABASE_ADMIN_URL')
  const entries: [string, string][] = [
    ['APP_URL', previewUrl],
    ['PRAETORIUM_SEED_PREVIEW', 'true'],
    // Its own database on the preview Postgres, created and emptied at boot.
    ['DATABASE_URL', previewDatabaseUrl(admin, prNumber)],
    ['PRAETORIUM_PREVIEW_ADMIN_DATABASE_URL', admin],
  ]
  const snapshot = value(source, 'CATALOGUE_SNAPSHOT_BASE_URL')
  if (snapshot) entries.push(['CATALOGUE_SNAPSHOT_BASE_URL', snapshot])
  // No VALKEY_URL: a preview is one replica, so sessions and the limiter belong in
  // Postgres and Centrifugo fans out in process. Sharing one Valkey across previews
  // would put every preview's sessions in the same keyspace.
  return entries.map(([name, entry]) => `${name}=${entry}`).join('\n')
}
