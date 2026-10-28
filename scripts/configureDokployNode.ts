import { setTimeout as delay } from 'node:timers/promises'
import { verifyWebAssetRoute } from './publishWebAssets.ts'
import { webAssetRouting } from './lib/webAssetRouting.ts'
import { isEntryPoint } from './lib/entryPoint.ts'
import { type DokployApi, dokployWebApplication } from './lib/dokployWeb.ts'
import { requiredEnv } from './lib/requiredEnv.ts'
import { isSpacetimeInternalHost } from './lib/spacetimeInternalHost.ts'
import { STARTUP_BUDGET_MS } from './lib/startupBudget.ts'

type Application = {
  env: string | null
  buildArgs: string | null
  buildSecrets: string | null
  dockerImage: string | null
}

const webHost = (target: 'staging' | 'production') => (target === 'production' ? 'praetorium.gg' : 'staging.praetorium.gg')

export function nodeEnvironment(environment: NodeJS.ProcessEnv, target: 'staging' | 'production') {
  const url = `https://${webHost(target)}`
  const database = `praetorium-${target}`
  const internalHost = requiredEnv('SPACETIME_INTERNAL_HOST', environment)
  if (!isSpacetimeInternalHost(internalHost)) throw new Error('Invalid SpacetimeDB internal host')
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
    // Releases prepare this catalogue for their compiler before replicas change.
    entries.CATALOGUE_LIVE_ARCHIVE = 'production'
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
    // Previews' seeded accounts must not prove themselves to the production Support inbox, nor email its players.
    for (const name of ['POSTHOG_SUPPORT_IDENTITY_SECRET', 'POSTHOG_SUPPORT_API_KEY', 'SUPPORT_REPLY_WEBHOOK_SECRET']) {
      if (environment[name]) entries[name] = requiredEnv(name, environment)
    }
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

export async function ensureWebHealthCheck(api: DokployApi, applicationId: string) {
  const healthCheckSwarm = {
    Test: ['CMD', 'node', '/app/scripts/healthcheck.ts'],
    Interval: 10_000_000_000,
    Timeout: 10_000_000_000,
    StartPeriod: STARTUP_BUDGET_MS * 1_000_000,
    Retries: 3,
  }
  await api('application.update', { body: { applicationId, healthCheckSwarm } })
  const saved = await api<{ applicationId: string; healthCheckSwarm: typeof healthCheckSwarm | null }>('application.one', {
    query: { applicationId },
  })
  if (
    saved.applicationId !== applicationId ||
    !saved.healthCheckSwarm ||
    Object.entries(healthCheckSwarm).some(
      ([key, value]) => JSON.stringify(saved.healthCheckSwarm![key as keyof typeof healthCheckSwarm]) !== JSON.stringify(value),
    )
  )
    throw new Error('Dokploy health check did not persist')
}

export async function ensureWebDomain(api: DokployApi, applicationId: string, host: string) {
  const list = async () => {
    const domains = await api<Domain[]>('domain.byApplicationId', { query: { applicationId } })
    if (!Array.isArray(domains)) throw new Error('Dokploy returned invalid domains')
    return domains.filter((domain) => domain.host === host)
  }
  let domains = await list()
  if (domains.length === 0) {
    await api('domain.create', {
      body: {
        applicationId,
        host,
        path: '/',
        port: 3000,
        https: true,
        certificateType: 'letsencrypt',
        domainType: 'application',
      },
    })
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
  api: DokployApi,
  applicationId: string,
  host: string,
  directories: string[],
  { wait = (milliseconds: number) => delay(milliseconds), verify = verifyWebAssetRoute } = {},
) {
  const read = async () => {
    const source = await api('application.readTraefikConfig', { query: { applicationId } })
    if (typeof source !== 'string') throw new Error('Missing Dokploy Traefik configuration')
    return source
  }
  const previous = await read()
  if (!directories.length) throw new Error('Asset directories are required for route verification')
  const traefikConfig = webAssetRouting(previous, host)
  if (traefikConfig === previous) return verify(directories, `https://${host}`)
  const save = async (config: string) => {
    await api('application.updateTraefikConfig', { body: { applicationId, traefikConfig: config } })
    if ((await read()) !== config) throw new Error('Dokploy asset routing did not persist')
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
  if (!['configure', 'image', 'assets'].includes(command ?? '') || (target !== 'staging' && target !== 'production')) {
    throw new Error('Usage: configureDokployNode.ts configure|image|assets staging|production')
  }
  const { api, applicationId, inspect } = dokployWebApplication<Application>(process.env)
  const application = await inspect()
  if (command === 'image') {
    if (!/^ghcr\.io\/richardsolomou\/praetorium\.gg(?::[a-zA-Z0-9_.-]+)?@sha256:[a-f0-9]{64}$/.test(application.dockerImage ?? ''))
      throw new Error('Expected an immutable installed web image')
    console.log(application.dockerImage)
    return
  }
  if (command === 'assets') {
    await configureWebAssetRoute(api, applicationId, webHost(target), process.argv.slice(4))
    console.log(`Configured ${target} shared web assets`)
    return
  }
  const env = nodeEnvironment(process.env, target)
  // The client's error quotes Dokploy's answer, which may echo the secrets sent.
  await api('application.saveEnvironment', {
    body: { applicationId, env, buildArgs: application.buildArgs, buildSecrets: application.buildSecrets, createEnvFile: false },
  }).catch(() => {
    throw new Error('Dokploy environment save failed')
  })
  if ((await inspect()).env !== env) throw new Error('Dokploy environment did not persist')
  await ensureWebHealthCheck(api, applicationId)
  await ensureWebDomain(api, applicationId, webHost(target))
  console.log(`Configured ${target} web environment`)
}

if (isEntryPoint(import.meta.url)) await run()
