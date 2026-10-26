import { execFile as execFileCallback } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { DokployClient, dokployPreviewFromEnvironment, loadPreviewAppSecrets, pullRequestNumber } from 'ras-stack/preview/dokploy'
import { callSpacetime, deleteSpacetimeDatabase, publishSpacetimeModule, type SpacetimeConnection } from 'ras-stack/spacetime'
import { moduleEnvironment } from './lib/spacetimeEnvironment.ts'
import { isEntryPoint } from './lib/entryPoint.ts'
import { isSpacetimeInternalHost } from './lib/spacetimeInternalHost.ts'
import { requiredEnv } from './lib/requiredEnv.ts'
import { waitForWebRevision } from './lib/webReadiness.ts'

const execFile = promisify(execFileCallback)
const allowedSecrets = [
  'SPACETIME_URL',
  'SPACETIME_ADMIN_TOKEN',
  'SPACETIME_ACCESS_CLIENT_ID',
  'SPACETIME_ACCESS_CLIENT_SECRET',
  'SPACETIME_INTERNAL_HOST',
]

export function previewDatabase(number: string) {
  return `praetorium-pr-${pullRequestNumber(number)}`
}

export function previewImageRevision(image: string, number: string) {
  const match = /:preview-pr-([1-9][0-9]{0,7})-sha-([0-9a-f]{40})@sha256:[0-9a-f]{64}$/.exec(image)
  if (!match || match[1] !== pullRequestNumber(number)) throw new Error('Preview image must pin this PR and revision by digest')
  return match[2]!
}

function spacetimeOrigin() {
  const origin = new URL(requiredEnv('SPACETIME_URL'))
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) {
    throw new Error('SPACETIME_URL must be an HTTPS origin')
  }
  return origin
}

function internalSpacetimeHost() {
  const host = requiredEnv('SPACETIME_INTERNAL_HOST')
  if (!isSpacetimeInternalHost(host)) throw new Error('Invalid SpacetimeDB internal host')
  return host
}

async function createIdentity() {
  const response = await fetch(new URL('/v1/identity', spacetimeOrigin()), {
    method: 'POST',
    headers: accessHeaders(),
    redirect: 'error',
    signal: AbortSignal.timeout(90_000),
  })
  if (!response.ok) throw new Error(`SpacetimeDB identity creation failed with HTTP ${response.status}`)
  return (await response.json()) as { identity?: unknown; token?: unknown }
}

function accessHeaders() {
  return {
    'CF-Access-Client-Id': requiredEnv('SPACETIME_ACCESS_CLIENT_ID'),
    'CF-Access-Client-Secret': requiredEnv('SPACETIME_ACCESS_CLIENT_SECRET'),
  }
}

function spacetimeConnection(database: string, token: string): SpacetimeConnection {
  return { url: spacetimeOrigin().href, database, token, headers: accessHeaders() }
}

async function removeDatabase(number: string) {
  await deleteSpacetimeDatabase(spacetimeConnection(previewDatabase(number), requiredEnv('SPACETIME_ADMIN_TOKEN')))
}

async function productModule(image: string) {
  const work = await mkdtemp(path.join(os.tmpdir(), 'praetorium-preview-module-'))
  let container: string | undefined
  try {
    // Absent until the deploying workflow passes them; a public package still pulls without them.
    const password = process.env.PREVIEW_REGISTRY_PASSWORD?.trim()
    if (password) {
      const login = execFile('docker', ['login', 'ghcr.io', '--username', requiredEnv('PREVIEW_REGISTRY_USERNAME'), '--password-stdin'], {
        timeout: 30_000,
      })
      login.child.stdin?.end(password)
      await login
    }
    await execFile('docker', ['buildx', 'imagetools', 'inspect', '--raw', image], { maxBuffer: 4_000_000, timeout: 60_000 })
    await execFile('docker', ['pull', image], { maxBuffer: 4_000_000, timeout: 300_000 })
    container = (await execFile('docker', ['create', image], { timeout: 30_000 })).stdout.trim()
    const file = path.join(work, 'product.js')
    await execFile('docker', ['cp', `${container}:/app/spacetimedb/dist/bundle.js`, file], { timeout: 30_000 })
    const size = (await stat(file)).size
    if (!size || size > 20_000_000) throw new Error('Invalid preview product module size')
    return await readFile(file)
  } finally {
    if (container) await execFile('docker', ['rm', container], { timeout: 30_000 })
    await rm(work, { recursive: true, force: true })
  }
}

// Every image creates /data for the server user, so the volume is writable from whichever preview mounts it first.
const catalogueCache = { type: 'volume', volumeName: 'praetorium-preview-catalogues', mountPath: '/data' } as const

/**
 * Mounts the catalogue cache every preview shares, before the application first starts. Prepared
 * catalogues are scoped by compiler, so a preview whose compiler another has prepared starts in
 * seconds instead of compiling for minutes.
 */
export async function shareCatalogueCache(client: DokployClient, name: string) {
  let application = await client.application(name)
  if (!application) {
    await client.api('application.create', { body: { name, appName: name, environmentId: client.environmentId } })
    application = await client.application(name)
  }
  if (!application) throw new Error(`Dokploy did not create ${name}`)
  const { mounts } = await client.api<{ mounts?: { volumeName?: string | null; mountPath: string }[] }>('application.one', {
    query: { applicationId: application.applicationId },
  })
  if (mounts?.some((mount) => mount.volumeName === catalogueCache.volumeName && mount.mountPath === catalogueCache.mountPath)) return
  await client.api('mounts.create', { body: { ...catalogueCache, serviceType: 'application', serviceId: application.applicationId } })
}

async function deploy() {
  const number = pullRequestNumber(requiredEnv('PR_NUMBER'))
  const image = requiredEnv('PREVIEW_IMAGE')
  const revision = previewImageRevision(image, number)
  const { config } = dokployPreviewFromEnvironment()
  if (!config.domain) throw new Error('Preview requires a protected HTTPS domain')
  await shareCatalogueCache(
    new DokployClient({ url: config.url, apiKey: config.apiKey, environmentId: config.environmentId }),
    `${config.applicationPrefix}-pr-${number}`,
  )
  const module = await productModule(image)
  const name = previewDatabase(number)
  const previewUrl = `https://${config.subdomainPrefix}-${number}.${config.domain}`
  const admin = requiredEnv('SPACETIME_ADMIN_TOKEN')
  const internalHost = internalSpacetimeHost()
  await removeDatabase(number)
  const identity = await createIdentity()
  if (typeof identity.identity !== 'string' || !/^[0-9a-f]{64}$/.test(identity.identity) || typeof identity.token !== 'string') {
    throw new Error('Invalid SpacetimeDB operator identity')
  }
  const issuer = `${previewUrl}/api/auth/preview/${revision}`
  await publishSpacetimeModule(spacetimeConnection(name, admin), module, {
    environment: moduleEnvironment({ issuer, audience: name, operator: identity.identity }),
  })
  await callSpacetime(spacetimeConnection(name, identity.token), 'operator_health', [])
  process.env.PREVIEW_ENVIRONMENT = [
    'APP_URL={{PREVIEW_URL}}',
    `AUTH_SECRET=${randomBytes(32).toString('hex')}`,
    // Outside the shared /data volume, so each deployment starts with fresh accounts.
    'AUTH_SQLITE_PATH=/home/node/auth.sqlite',
    'AUTH_INITIALIZE_EMPTY=true',
    'CATALOGUE_REFRESH_SCOPE=compiler',
    'PRAETORIUM_SEED_PREVIEW=true',
    `SPACETIME_URL=http://${internalHost}:3000/`,
    `SPACETIME_INTERNAL_HOST=${internalHost}`,
    `SPACETIME_DATABASE=${name}`,
    `SPACETIME_AUDIENCE=${name}`,
    `SPACETIME_ISSUER=${issuer}`,
    `SPACETIME_OPERATOR_TOKEN=${identity.token}`,
  ].join('\n')
  try {
    await execFile('pnpm', ['exec', 'ras', 'preview', 'dokploy', 'deploy'], { env: process.env, timeout: 900_000, maxBuffer: 4_000_000 })
  } catch (error) {
    if (!(error as { stderr?: string }).stderr?.includes(`Timed out waiting for ${previewUrl}/api/health`)) throw error
    console.log('The preview is still preparing its catalogue')
  }
  await waitForWebRevision(previewUrl, revision)
}

async function run() {
  loadPreviewAppSecrets(allowedSecrets)
  const command = process.argv[2]
  if (command === 'deploy') return deploy()
  if (command === 'delete') {
    const number = pullRequestNumber(requiredEnv('PR_NUMBER'))
    await removeDatabase(number)
    await execFile('pnpm', ['exec', 'ras', 'preview', 'dokploy', 'delete'], { env: process.env, timeout: 120_000 })
    return
  }
  if (command === 'prune') {
    const { config } = dokployPreviewFromEnvironment()
    const client = new DokployClient({ url: config.url, apiKey: config.apiKey, environmentId: config.environmentId })
    const open = new Set((process.env.OPEN_PR_NUMBERS ?? '').split(/\s+/).filter(Boolean).map(pullRequestNumber))
    for (const application of await client.applications()) {
      const match = new RegExp(`^${config.applicationPrefix}-pr-([1-9][0-9]{0,7})$`).exec(application.name)
      if (match && !open.has(match[1]!)) await removeDatabase(match[1]!)
    }
    await execFile('pnpm', ['exec', 'ras', 'preview', 'dokploy', 'prune'], { env: process.env, timeout: 900_000, maxBuffer: 4_000_000 })
    return
  }
  throw new Error('Usage: dokployPreview.ts deploy|delete|prune')
}

if (isEntryPoint(import.meta.url)) await run()
