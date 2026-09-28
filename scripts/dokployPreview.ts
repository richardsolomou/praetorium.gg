import { execFile as execFileCallback } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { DokployClient, dokployPreviewFromEnvironment, loadPreviewAppSecrets, pullRequestNumber } from 'ras-stack/preview/dokploy'

const execFile = promisify(execFileCallback)
const allowedSecrets = [
  'SPACETIME_URL',
  'SPACETIME_ADMIN_TOKEN',
  'SPACETIME_ACCESS_CLIENT_ID',
  'SPACETIME_ACCESS_CLIENT_SECRET',
  'SPACETIME_INTERNAL_HOST',
]

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function previewDatabase(number: string) {
  return `praetorium-pr-${pullRequestNumber(number)}`
}

export function previewImageRevision(image: string, number: string) {
  const match = /:preview-pr-([1-9][0-9]{0,7})-sha-([0-9a-f]{40})@sha256:[0-9a-f]{64}$/.exec(image)
  if (!match || match[1] !== pullRequestNumber(number)) throw new Error('Preview image must pin this PR and revision by digest')
  return match[2]!
}

function spacetimeOrigin() {
  const origin = new URL(required('SPACETIME_URL'))
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) {
    throw new Error('SPACETIME_URL must be an HTTPS origin')
  }
  return origin
}

function internalSpacetimeHost() {
  const host = required('SPACETIME_INTERNAL_HOST')
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(host)) throw new Error('Invalid SpacetimeDB internal host')
  return host
}

async function spacetime(method: string, pathname: string, body?: BodyInit, token?: string) {
  const response = await fetch(new URL(pathname, spacetimeOrigin()), {
    method,
    headers: {
      'CF-Access-Client-Id': required('SPACETIME_ACCESS_CLIENT_ID'),
      'CF-Access-Client-Secret': required('SPACETIME_ACCESS_CLIENT_SECRET'),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(typeof body === 'string' ? { 'content-type': 'application/json' } : {}),
    },
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(90_000),
  })
  if (!response.ok) throw new Error(`SpacetimeDB ${method} ${pathname} failed with HTTP ${response.status}`)
  return response
}

async function removeDatabase(number: string) {
  const name = previewDatabase(number)
  const response = await fetch(new URL(`/v1/database/${name}`, spacetimeOrigin()), {
    headers: {
      'CF-Access-Client-Id': required('SPACETIME_ACCESS_CLIENT_ID'),
      'CF-Access-Client-Secret': required('SPACETIME_ACCESS_CLIENT_SECRET'),
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (response.status === 404) return
  if (!response.ok) throw new Error(`SpacetimeDB lookup failed with HTTP ${response.status}`)
  await spacetime('DELETE', `/v1/database/${name}`, undefined, required('SPACETIME_ADMIN_TOKEN'))
}

async function productModule(image: string) {
  const work = await mkdtemp(path.join(os.tmpdir(), 'praetorium-preview-module-'))
  let container: string | undefined
  try {
    await execFile('docker', ['logout', 'ghcr.io'], { timeout: 30_000 })
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

async function deploy() {
  const number = pullRequestNumber(required('PR_NUMBER'))
  const image = required('PREVIEW_IMAGE')
  const revision = previewImageRevision(image, number)
  const { config } = dokployPreviewFromEnvironment()
  if (!config.domain) throw new Error('Preview requires a protected HTTPS domain')
  const module = await productModule(image)
  const name = previewDatabase(number)
  const previewUrl = `https://${config.subdomainPrefix}-${number}.${config.domain}`
  const admin = required('SPACETIME_ADMIN_TOKEN')
  const internalHost = internalSpacetimeHost()
  await removeDatabase(number)
  const identity = (await (await spacetime('POST', '/v1/identity')).json()) as { identity?: unknown; token?: unknown }
  if (typeof identity.identity !== 'string' || !/^[0-9a-f]{64}$/.test(identity.identity) || typeof identity.token !== 'string') {
    throw new Error('Invalid SpacetimeDB operator identity')
  }
  await spacetime('PUT', `/v1/database/${name}?host_type=Js`, module, admin)
  const issuer = `${previewUrl}/api/auth/preview/${revision}`
  await spacetime('POST', `/v1/database/${name}/call/configure`, JSON.stringify([issuer, name, identity.identity]), admin)
  await spacetime('POST', `/v1/database/${name}/call/operator_health`, '[]', identity.token)
  process.env.PREVIEW_ENVIRONMENT = [
    'APP_URL={{PREVIEW_URL}}',
    `AUTH_SECRET=${randomBytes(32).toString('hex')}`,
    'AUTH_SQLITE_PATH=/data/auth.sqlite',
    'AUTH_INITIALIZE_EMPTY=true',
    'PRAETORIUM_SEED_PREVIEW=true',
    `SPACETIME_URL=http://${internalHost}:3000/`,
    `SPACETIME_INTERNAL_HOST=${internalHost}`,
    `SPACETIME_DATABASE=${name}`,
    `SPACETIME_AUDIENCE=${name}`,
    `SPACETIME_ISSUER=${issuer}`,
    `SPACETIME_OPERATOR_TOKEN=${identity.token}`,
  ].join('\n')
  await execFile('pnpm', ['exec', 'ras', 'preview', 'dokploy', 'deploy'], { env: process.env, timeout: 900_000, maxBuffer: 4_000_000 })
  const health = await fetch(`${previewUrl}/api/health`, { signal: AbortSignal.timeout(15_000) })
  if (!health.ok || health.headers.get('x-praetorium-revision') !== revision) {
    throw new Error(`Preview ${number} did not serve revision ${revision}`)
  }
}

async function run() {
  loadPreviewAppSecrets(allowedSecrets)
  const command = process.argv[2]
  if (command === 'deploy') return deploy()
  if (command === 'delete') {
    const number = pullRequestNumber(required('PR_NUMBER'))
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

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await run()
