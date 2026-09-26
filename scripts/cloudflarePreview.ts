import { randomBytes } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { closedPreviewNumbers, d1DatabaseId, previewConfig, previewNames, previewNumber } from './lib/cloudflarePreview'

const execFile = promisify(execFileCallback)
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
if (!accountId || !/^[0-9a-f]{32}$/.test(accountId)) throw new Error('CLOUDFLARE_ACCOUNT_ID is required')

async function wrangler(...args: string[]) {
  const { stdout } = await execFile('pnpm', ['exec', 'wrangler', ...args], { maxBuffer: 4_000_000 })
  return stdout
}

async function databases() {
  return JSON.parse(await wrangler('d1', 'list', '--json')) as unknown
}

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function serverUrl() {
  const url = new URL(required('SPACETIME_URL'))
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('SPACETIME_URL must be an HTTPS origin')
  }
  return url
}

async function spacetime(method: string, pathname: string, body?: BodyInit, authorization?: string) {
  const response = await fetch(new URL(pathname, serverUrl()), {
    method,
    headers: {
      'CF-Access-Client-Id': required('SPACETIME_ACCESS_CLIENT_ID'),
      'CF-Access-Client-Secret': required('SPACETIME_ACCESS_CLIENT_SECRET'),
      ...(authorization ? { authorization: `Bearer ${authorization}` } : {}),
      ...(typeof body === 'string' ? { 'content-type': 'application/json' } : {}),
    },
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`SpacetimeDB ${method} ${pathname} failed with HTTP ${response.status}`)
  return response
}

async function remove(number: number) {
  const names = previewNames(number)
  const worker = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/services/${names.worker}`, {
    headers: { authorization: `Bearer ${required('CLOUDFLARE_API_TOKEN')}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (worker.ok) await wrangler('delete', names.worker, '--force')
  else if (worker.status !== 404) throw new Error(`Cloudflare Worker lookup failed with HTTP ${worker.status}`)
  const response = await fetch(new URL(`/v1/database/${names.product}`, serverUrl()), {
    headers: {
      'CF-Access-Client-Id': required('SPACETIME_ACCESS_CLIENT_ID'),
      'CF-Access-Client-Secret': required('SPACETIME_ACCESS_CLIENT_SECRET'),
    },
    signal: AbortSignal.timeout(10_000),
  })
  if (response.status !== 404) {
    if (!response.ok) throw new Error(`SpacetimeDB lookup failed with HTTP ${response.status}`)
    await spacetime('DELETE', `/v1/database/${names.product}`, undefined, required('SPACETIME_ADMIN_TOKEN'))
  }
  if (d1DatabaseId(await databases(), names.auth)) await wrangler('d1', 'delete', names.auth, '--skip-confirmation')
}

async function deploy() {
  const number = previewNumber(process.env.PR_NUMBER)
  const names = previewNames(number)
  const sha = required('PREVIEW_SHA')
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Invalid preview revision')
  const image = required('PREVIEW_IMAGE')
  if (image !== `praetorium-pr-${number}:sha-${sha}`) throw new Error('Invalid preview image')
  const workerBundle = path.resolve(required('PREVIEW_WORKER_BUNDLE'))
  const productBundle = await readFile(path.resolve(required('PREVIEW_PRODUCT_BUNDLE')))
  const registryImage = `registry.cloudflare.com/${accountId}/${image}`
  await wrangler('containers', 'push', image)

  const existing = d1DatabaseId(await databases(), names.auth)
  if (existing) await wrangler('d1', 'delete', names.auth, '--skip-confirmation')
  await wrangler('d1', 'create', names.auth, '--location', 'weur')
  const databaseId = d1DatabaseId(await databases(), names.auth)
  if (!databaseId) throw new Error('Created D1 database was not listed')

  const adminToken = required('SPACETIME_ADMIN_TOKEN')
  const present = await fetch(new URL(`/v1/database/${names.product}`, serverUrl()), {
    headers: {
      'CF-Access-Client-Id': required('SPACETIME_ACCESS_CLIENT_ID'),
      'CF-Access-Client-Secret': required('SPACETIME_ACCESS_CLIENT_SECRET'),
    },
    signal: AbortSignal.timeout(10_000),
  })
  if (present.ok) await spacetime('DELETE', `/v1/database/${names.product}`, undefined, adminToken)
  else if (present.status !== 404) throw new Error(`SpacetimeDB lookup failed with HTTP ${present.status}`)
  const issued = (await (await spacetime('POST', '/v1/identity')).json()) as { identity?: unknown; token?: unknown }
  if (typeof issued.identity !== 'string' || !/^[0-9a-f]{64}$/.test(issued.identity) || typeof issued.token !== 'string') {
    throw new Error('Invalid SpacetimeDB operator identity')
  }
  await spacetime('PUT', `/v1/database/${names.product}?host_type=Js`, productBundle, adminToken)
  await spacetime(
    'POST',
    `/v1/database/${names.product}/call/configure`,
    JSON.stringify([`${names.origin}/api/auth`, names.audience, issued.identity]),
    adminToken,
  )
  await spacetime('POST', `/v1/database/${names.product}/call/operator_health`, '[]', issued.token)

  const directory = await mkdtemp(path.join(tmpdir(), 'praetorium-preview-'))
  try {
    const configPath = path.join(directory, 'wrangler.json')
    const secretsPath = path.join(directory, 'secrets.json')
    await writeFile(configPath, JSON.stringify(previewConfig({ number, main: workerBundle, image: registryImage, databaseId })))
    await writeFile(
      secretsPath,
      JSON.stringify({
        AUTH_SECRET: randomBytes(32).toString('base64url'),
        SPACETIME_URL: serverUrl().toString(),
        SPACETIME_OPERATOR_TOKEN: issued.token,
        SPACETIME_ACCESS_CLIENT_ID: required('SPACETIME_ACCESS_CLIENT_ID'),
        SPACETIME_ACCESS_CLIENT_SECRET: required('SPACETIME_ACCESS_CLIENT_SECRET'),
        ...(process.env.CATALOGUE_BASE_URL ? { CATALOGUE_BASE_URL: process.env.CATALOGUE_BASE_URL } : {}),
      }),
      { mode: 0o600 },
    )
    await wrangler(
      'd1',
      'execute',
      names.auth,
      '--remote',
      '--yes',
      '--file',
      path.resolve('drizzle-auth/0000_curly_gambit.sql'),
      '--config',
      configPath,
    )
    await wrangler(
      'deploy',
      '--no-bundle',
      '--config',
      configPath,
      '--secrets-file',
      secretsPath,
      '--domain',
      new URL(names.origin).hostname,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${names.origin}/api/health`, { signal: AbortSignal.timeout(10_000) })
      if (response.ok && response.headers.get('x-praetorium-revision') === sha) return
    } catch {
      /* The container may still be starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000))
  }
  throw new Error(`Preview ${number} did not serve revision ${sha}`)
}

const command = process.argv[2]
if (command === 'deploy') await deploy()
else if (command === 'delete') await remove(previewNumber(process.env.PR_NUMBER))
else if (command === 'prune') {
  const open = new Set(
    (process.env.OPEN_PR_NUMBERS ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((value) => previewNumber(value)),
  )
  for (const closed of closedPreviewNumbers(await databases(), open)) await remove(closed)
} else throw new Error('Usage: cloudflarePreview.ts <deploy|delete|prune>')
