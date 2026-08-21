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

/**
 * The previews that still exist, as Dokploy sees them.
 *
 * Dokploy is the authority on what is alive, so a database with no application
 * belongs to a pull request that closed. Reading it here means the cleanup needs
 * no GitHub token and no route from a runner into the database network.
 */
export function livePullRequests(applicationNames: readonly string[], applicationPrefix: string, current: string) {
  const pattern = new RegExp(`^${applicationPrefix}-pr-(\\d+)$`)
  const live = new Set([pullRequestNumber(current)])
  for (const name of applicationNames) {
    const found = pattern.exec(name.trim())
    if (found?.[1]) live.add(found[1])
  }
  return [...live].sort((left, right) => Number(left) - Number(right))
}

export function previewEnv(prNumber: string, previewUrl: string, source: Source = process.env, live: readonly string[] = []) {
  const admin = required(source, 'PREVIEW_DATABASE_ADMIN_URL')
  const entries: [string, string][] = [
    ['APP_URL', previewUrl],
    ['PRAETORIUM_SEED_PREVIEW', 'true'],
    // Its own database on the preview Postgres, created and emptied at boot.
    ['DATABASE_URL', previewDatabaseUrl(admin, prNumber)],
    ['PRAETORIUM_PREVIEW_ADMIN_DATABASE_URL', admin],
  ]
  // Everything still open, so the container can drop the databases of pull
  // requests that closed. Absent means "do not know", and the container leaves
  // every database alone rather than guessing.
  if (live.length) entries.push(['PRAETORIUM_PREVIEW_LIVE_PR_NUMBERS', live.join(' ')])
  const snapshot = value(source, 'CATALOGUE_SNAPSHOT_BASE_URL')
  if (snapshot) entries.push(['CATALOGUE_SNAPSHOT_BASE_URL', snapshot])
  // No VALKEY_URL: a preview is one replica, so sessions and the limiter belong in
  // Postgres and Centrifugo fans out in process. Sharing one Valkey across previews
  // would put every preview's sessions in the same keyspace.
  return entries.map(([name, entry]) => `${name}=${entry}`).join('\n')
}
