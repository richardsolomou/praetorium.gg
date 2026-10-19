import { setTimeout as delay } from 'node:timers/promises'
import { verifyWebAssetRoute } from './publishWebAssets.ts'
import { webAssetRouting } from './lib/webAssetRouting.ts'
import { isEntryPoint } from './lib/entryPoint.ts'
import { requiredEnv } from './lib/requiredEnv.ts'

type Application = {
  applicationId: string
  name: string
  environmentId: string
  env: string | null
  buildArgs: string | null
  buildSecrets: string | null
  dockerImage: string | null
}

export function nodeEnvironment(environment: NodeJS.ProcessEnv, target: 'staging' | 'production') {
  const url = target === 'production' ? 'https://praetorium.gg' : 'https://staging.praetorium.gg'
  const database = `praetorium-${target}`
  const internalHost = requiredEnv('SPACETIME_INTERNAL_HOST', environment)
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(internalHost)) throw new Error('Invalid SpacetimeDB internal host')
  const entries: Record<string, string> = {
    APP_URL: url,
    AUTH_SECRET: requiredEnv('AUTH_SECRET', environment),
    AUTH_SQLITE_PATH: '/data/auth.sqlite',
    SPACETIME_URL: `http://${internalHost}:3000/`,
    SPACETIME_INTERNAL_HOST: internalHost,
    SPACETIME_DATABASE: database,
    SPACETIME_AUDIENCE: database,
    SPACETIME_OPERATOR_TOKEN: requiredEnv('SPACETIME_OPERATOR_TOKEN', environment),
    R2_ACCOUNT_ID: requiredEnv('R2_ACCOUNT_ID', environment),
    ASSETS_R2_ACCESS_KEY_ID: requiredEnv('ASSETS_R2_ACCESS_KEY_ID', environment),
    ASSETS_R2_SECRET_ACCESS_KEY: requiredEnv('ASSETS_R2_SECRET_ACCESS_KEY', environment),
    PUBLIC_ASSETS_BASE_URL: 'https://s3.praetorium.gg',
  }
  for (const name of [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'EMAIL_FROM',
    'EXPO_PUSH_ACCESS_TOKEN',
    'POSTHOG_HOST',
    'POSTHOG_API_KEY',
    'POSTHOG_PROJECT_ID',
    'VITE_POSTHOG_HOST',
    'VITE_POSTHOG_PROJECT_TOKEN',
  ]) {
    if (environment[name]) entries[name] = requiredEnv(name, environment)
  }
  if (target === 'production') {
    entries.R2_ACCESS_KEY_ID = requiredEnv('R2_ACCESS_KEY_ID', environment)
    entries.R2_SECRET_ACCESS_KEY = requiredEnv('R2_SECRET_ACCESS_KEY', environment)
    entries.APPLE_CLIENT_ID = requiredEnv('APPLE_CLIENT_ID', environment)
    entries.APPLE_TEAM_ID = requiredEnv('APPLE_TEAM_ID', environment)
    entries.APPLE_KEY_ID = requiredEnv('APPLE_KEY_ID', environment)
    entries.APPLE_PRIVATE_KEY_BASE64 = Buffer.from(environment.APPLE_PRIVATE_KEY ?? '', 'utf8').toString('base64')
    if (!entries.APPLE_PRIVATE_KEY_BASE64) throw new Error('APPLE_PRIVATE_KEY is required')
    // A GitHub OAuth app answers one callback URL, which is production's.
    for (const name of ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_SPONSORS_TOKEN']) {
      if (environment[name]) entries[name] = requiredEnv(name, environment)
    }
    // Only production's pages belong in search results.
    if (environment.INDEXNOW_KEY) entries.INDEXNOW_KEY = requiredEnv('INDEXNOW_KEY', environment)
    // Only real uploads are worth screening.
    if (environment.TYPESAFE_API_KEY) entries.TYPESAFE_API_KEY = requiredEnv('TYPESAFE_API_KEY', environment)
  }
  return Object.entries(entries)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n')
}

type Domain = {
  domainId: string
  applicationId: string
  host: string
  path: string
  port: number
  https: boolean
  certificateType: string
  domainType: string
  enabled: boolean
}

export async function ensureWebHealthCheck(origin: URL, headers: Record<string, string>, applicationId: string, request = fetch) {
  const healthCheckSwarm = {
    Test: ['CMD', 'node', '/app/scripts/healthcheck.ts'],
    Interval: 10_000_000_000,
    Timeout: 10_000_000_000,
    StartPeriod: 1_800_000_000_000,
    Retries: 3,
  }
  const response = await request(new URL('/api/application.update', origin), {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ applicationId, healthCheckSwarm }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Dokploy health check save failed with HTTP ${response.status}`)
  const url = new URL('/api/application.one', origin)
  url.searchParams.set('applicationId', applicationId)
  const readback = await request(url, { headers, signal: AbortSignal.timeout(30_000) })
  if (!readback.ok) throw new Error(`Dokploy health check read failed with HTTP ${readback.status}`)
  const saved = (await readback.json()) as { applicationId: string; healthCheckSwarm: typeof healthCheckSwarm | null }
  if (
    saved.applicationId !== applicationId ||
    !saved.healthCheckSwarm ||
    Object.entries(healthCheckSwarm).some(
      ([key, value]) => JSON.stringify(saved.healthCheckSwarm![key as keyof typeof healthCheckSwarm]) !== JSON.stringify(value),
    )
  )
    throw new Error('Dokploy health check did not persist')
}

export async function ensureWebDomain(origin: URL, headers: Record<string, string>, applicationId: string, host: string, request = fetch) {
  const list = async () => {
    const url = new URL('/api/domain.byApplicationId', origin)
    url.searchParams.set('applicationId', applicationId)
    const response = await request(url, { headers, signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`Dokploy domain read failed with HTTP ${response.status}`)
    const domains = (await response.json()) as Domain[]
    if (!Array.isArray(domains)) throw new Error('Dokploy returned invalid domains')
    return domains.filter((domain) => domain.host === host)
  }
  let domains = await list()
  if (domains.length === 0) {
    const response = await request(new URL('/api/domain.create', origin), {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        applicationId,
        host,
        path: '/',
        port: 3000,
        https: true,
        certificateType: 'letsencrypt',
        domainType: 'application',
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`Dokploy domain create failed with HTTP ${response.status}`)
    domains = await list()
  }
  if (
    domains.length !== 1 ||
    domains[0]?.applicationId !== applicationId ||
    domains[0].path !== '/' ||
    domains[0].port !== 3000 ||
    !domains[0].https ||
    domains[0].certificateType !== 'letsencrypt' ||
    domains[0].domainType !== 'application' ||
    !domains[0].enabled
  ) {
    throw new Error('Dokploy web domain differs from the verified configuration')
  }
}

export async function configureWebAssetRoute(
  origin: URL,
  headers: Record<string, string>,
  applicationId: string,
  host: string,
  directories: string[],
  { request = fetch, wait = (milliseconds: number) => delay(milliseconds), verify = verifyWebAssetRoute } = {},
) {
  const url = new URL('/api/application.readTraefikConfig', origin)
  url.searchParams.set('applicationId', applicationId)
  const read = async () => {
    const response = await request(url, { headers, signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error('Dokploy Traefik read failed')
    const source = await response.json()
    if (typeof source !== 'string') throw new Error('Missing Dokploy Traefik configuration')
    return source
  }
  const previous = await read()
  if (!directories.length) throw new Error('Asset directories are required for route verification')
  const traefikConfig = webAssetRouting(previous, host)
  const save = async (config: string) => {
    const response = await request(new URL('/api/application.updateTraefikConfig', origin), {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ applicationId, traefikConfig: config }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok || (await read()) !== config) throw new Error('Dokploy asset routing did not persist')
  }
  try {
    await save(traefikConfig)
    // Traefik's file provider debounces configuration reloads.
    await wait(5_000)
    await verify(directories, `https://${host}`)
  } catch (error) {
    const current = await read()
    if (current !== previous && current !== traefikConfig)
      throw new Error('Dokploy routing changed during asset verification', { cause: error })
    await save(previous)
    throw error
  }
}

async function run() {
  const [command, target] = process.argv.slice(2)
  if (!['configure', 'domain', 'image', 'assets'].includes(command ?? '') || (target !== 'staging' && target !== 'production')) {
    throw new Error('Usage: configureDokployNode.ts configure|domain|image|assets staging|production')
  }
  const origin = new URL(requiredEnv('DOKPLOY_URL'))
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid Dokploy URL')
  const applicationId = requiredEnv('DOKPLOY_APPLICATION_ID')
  const environmentId = requiredEnv('DOKPLOY_ENVIRONMENT_ID')
  const headers = { 'x-api-key': requiredEnv('DOKPLOY_API_KEY') }
  const inspect = async (): Promise<Application> => {
    const url = new URL('/api/application.one', origin)
    url.searchParams.set('applicationId', applicationId)
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`Dokploy read failed with HTTP ${response.status}`)
    const application = (await response.json()) as Application
    if (application.applicationId !== applicationId || application.environmentId !== environmentId || application.name !== 'web') {
      throw new Error('Unexpected Dokploy web application')
    }
    return application
  }
  const application = await inspect()
  if (command === 'image') {
    if (!/^ghcr\.io\/richardsolomou\/praetorium\.gg(?::[a-zA-Z0-9_.-]+)?@sha256:[a-f0-9]{64}$/.test(application.dockerImage ?? ''))
      throw new Error('Expected an immutable installed web image')
    console.log(application.dockerImage)
    return
  }
  if (command === 'assets') {
    await configureWebAssetRoute(
      origin,
      headers,
      applicationId,
      target === 'production' ? 'praetorium.gg' : 'staging.praetorium.gg',
      process.argv.slice(4),
    )
    console.log(`Configured ${target} shared web assets`)
    return
  }
  if (command === 'domain') {
    await ensureWebDomain(origin, headers, applicationId, target === 'production' ? 'praetorium.gg' : 'staging.praetorium.gg')
    console.log(`Configured ${target} web domain`)
    return
  }
  const env = nodeEnvironment(process.env, target)
  const response = await fetch(new URL('/api/application.saveEnvironment', origin), {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      applicationId,
      env,
      buildArgs: application.buildArgs,
      buildSecrets: application.buildSecrets,
      createEnvFile: false,
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Dokploy environment save failed with HTTP ${response.status}`)
  if ((await inspect()).env !== env) throw new Error('Dokploy environment did not persist')
  await ensureWebHealthCheck(origin, headers, applicationId)
  await ensureWebDomain(origin, headers, applicationId, target === 'production' ? 'praetorium.gg' : 'staging.praetorium.gg')
  console.log(`Configured ${target} web environment`)
}

if (isEntryPoint(import.meta.url)) await run()
