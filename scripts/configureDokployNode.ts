import { pathToFileURL } from 'node:url'
import path from 'node:path'

type Application = {
  applicationId: string
  name: string
  environmentId: string
  env: string | null
  buildArgs: string | null
  buildSecrets: string | null
}

function required(environment: NodeJS.ProcessEnv, name: string) {
  const value = environment[name]
  if (!value) throw new Error(`${name} is required`)
  if (/[\r\n]/.test(value)) throw new Error(`${name} must be one line`)
  return value
}

export function nodeEnvironment(environment: NodeJS.ProcessEnv, target: 'staging' | 'production') {
  const url = target === 'production' ? 'https://praetorium.gg' : 'https://staging.praetorium.gg'
  const database = `praetorium-${target}`
  const internalHost = required(environment, 'SPACETIME_INTERNAL_HOST')
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(internalHost)) throw new Error('Invalid SpacetimeDB internal host')
  const entries: Record<string, string> = {
    APP_URL: url,
    AUTH_SECRET: required(environment, 'AUTH_SECRET'),
    AUTH_SQLITE_PATH: '/data/auth.sqlite',
    SPACETIME_URL: `http://${internalHost}:3000/`,
    SPACETIME_INTERNAL_HOST: internalHost,
    SPACETIME_DATABASE: database,
    SPACETIME_AUDIENCE: database,
    SPACETIME_OPERATOR_TOKEN: required(environment, 'SPACETIME_OPERATOR_TOKEN'),
    R2_ACCOUNT_ID: required(environment, 'R2_ACCOUNT_ID'),
    ASSETS_R2_ACCESS_KEY_ID: required(environment, 'ASSETS_R2_ACCESS_KEY_ID'),
    ASSETS_R2_SECRET_ACCESS_KEY: required(environment, 'ASSETS_R2_SECRET_ACCESS_KEY'),
    PUBLIC_ASSETS_BASE_URL: 'https://assets.praetorium.gg',
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
    if (environment[name]) entries[name] = required(environment, name)
  }
  if (target === 'production') {
    entries.R2_ACCESS_KEY_ID = required(environment, 'R2_ACCESS_KEY_ID')
    entries.R2_SECRET_ACCESS_KEY = required(environment, 'R2_SECRET_ACCESS_KEY')
    entries.APPLE_CLIENT_ID = required(environment, 'APPLE_CLIENT_ID')
    entries.APPLE_TEAM_ID = required(environment, 'APPLE_TEAM_ID')
    entries.APPLE_KEY_ID = required(environment, 'APPLE_KEY_ID')
    entries.APPLE_PRIVATE_KEY_BASE64 = Buffer.from(environment.APPLE_PRIVATE_KEY ?? '', 'utf8').toString('base64')
    if (!entries.APPLE_PRIVATE_KEY_BASE64) throw new Error('APPLE_PRIVATE_KEY is required')
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

async function run() {
  const [command, target] = process.argv.slice(2)
  if ((command !== 'configure' && command !== 'domain') || (target !== 'staging' && target !== 'production')) {
    throw new Error('Usage: configureDokployNode.ts configure|domain staging|production')
  }
  const origin = new URL(required(process.env, 'DOKPLOY_URL'))
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid Dokploy URL')
  const applicationId = required(process.env, 'DOKPLOY_APPLICATION_ID')
  const environmentId = required(process.env, 'DOKPLOY_ENVIRONMENT_ID')
  const headers = { 'x-api-key': required(process.env, 'DOKPLOY_API_KEY') }
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
  await ensureWebDomain(origin, headers, applicationId, target === 'production' ? 'praetorium.gg' : 'staging.praetorium.gg')
  console.log(`Configured ${target} web environment`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await run()
