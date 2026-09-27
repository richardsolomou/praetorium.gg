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
  const authImportKey = required(environment, 'AUTH_IMPORT_R2_KEY')
  const entries: Record<string, string> = {
    APP_URL: url,
    AUTH_SECRET: required(environment, 'AUTH_SECRET'),
    AUTH_SQLITE_PATH: '/data/auth.sqlite',
    AUTH_IMPORT_R2_KEY: authImportKey,
    SPACETIME_URL: required(environment, 'SPACETIME_URL'),
    SPACETIME_DATABASE: database,
    SPACETIME_AUDIENCE: database,
    SPACETIME_OPERATOR_TOKEN: required(environment, 'SPACETIME_OPERATOR_TOKEN'),
    SPACETIME_ACCESS_CLIENT_ID: required(environment, 'SPACETIME_ACCESS_CLIENT_ID'),
    SPACETIME_ACCESS_CLIENT_SECRET: required(environment, 'SPACETIME_ACCESS_CLIENT_SECRET'),
    R2_ACCOUNT_ID: required(environment, 'R2_ACCOUNT_ID'),
    R2_ACCESS_KEY_ID: required(environment, 'R2_ACCESS_KEY_ID'),
    R2_SECRET_ACCESS_KEY: required(environment, 'R2_SECRET_ACCESS_KEY'),
  }
  if (!new RegExp(`^backups/auth/import/${target}/[0-9a-f]{64}\\.sql\\.gz$`).test(authImportKey)) {
    throw new Error('Auth import belongs to a different environment or has no checksum')
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

export function withoutAuthImport(env: string) {
  return env
    .split('\n')
    .filter((line) => line && !line.startsWith('AUTH_IMPORT_R2_KEY='))
    .join('\n')
}

async function run() {
  const [command, target] = process.argv.slice(2)
  if ((command !== 'configure' && command !== 'clear-import') || (target !== 'staging' && target !== 'production')) {
    throw new Error('Usage: configureDokployNode.ts configure|clear-import staging|production')
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
  const env = command === 'configure' ? nodeEnvironment(process.env, target) : withoutAuthImport(application.env ?? '')
  if (command === 'clear-import' && !application.env?.includes('AUTH_IMPORT_R2_KEY=')) return
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
  console.log(command === 'configure' ? `Configured ${target} web environment` : `Cleared ${target} auth import key`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await run()
