/**
 * Pull request previews, driven through the Dokploy API.
 *
 * A preview is a whole instance: its own hostname, its own empty database, its own
 * copy of the catalogue. Nothing is shared with production and nothing is kept —
 * every deploy replaces the container, so the data is gone and that is the point.
 *
 * A replacement backend only has to implement deploy, delete and prune, and emit
 * the `preview-url` output.
 */
import fs from 'node:fs'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'

const PREVIEW_DOMAIN = 'praetorium.gg'
const PORT = 3000

type Application = { applicationId: string; name: string }

const nameFor = (prNumber: string) => `praetorium-pr-${prNumber}`
const hostFor = (prNumber: string) => `pr-${prNumber}.${PREVIEW_DOMAIN}`

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function requirePrNumber(): string {
  const value = requireEnv('PR_NUMBER')
  if (!/^\d+$/.test(value)) throw new Error('PR_NUMBER must be a pull request number')
  return value
}

async function api<T = unknown>(procedure: string, options: { query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
  const url = new URL(`${requireEnv('DOKPLOY_URL').replace(/\/$/, '')}/api/${procedure}`)
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value)
  console.log(`→ ${procedure}`)
  const response = await fetch(url, {
    method: options.body === undefined ? 'GET' : 'POST',
    headers: {
      'x-api-key': requireEnv('DOKPLOY_API_KEY'),
      ...(options.body !== undefined && { 'content-type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${procedure} failed with ${response.status}: ${text.slice(0, 500)}`)
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`${procedure} returned ${response.status} with a non-JSON body: ${text.slice(0, 200)}`)
  }
}

async function listApplications() {
  const environment = await api<{ applications?: Application[] } | undefined>('environment.one', {
    query: { environmentId: requireEnv('DOKPLOY_ENVIRONMENT_ID') },
  })
  if (!environment) throw new Error('environment.one returned an empty response; check DOKPLOY_URL and DOKPLOY_ENVIRONMENT_ID')
  return environment.applications ?? []
}

const findApplication = async (name: string) => (await listApplications()).find((application) => application.name === name)

async function waitForDeployment(applicationId: string) {
  const deadline = Date.now() + 10 * 60_000
  while (Date.now() < deadline) {
    await sleep(5_000)
    const { applicationStatus } = await api<{ applicationStatus: string }>('application.one', { query: { applicationId } })
    if (applicationStatus === 'done') return
    if (applicationStatus === 'error') throw new Error('Dokploy reported a failed deployment; check its deployment logs')
  }
  throw new Error('Timed out waiting for the Dokploy deployment to finish')
}

/**
 * The instance answers before its catalogue does — the community data is fetched in
 * the background and list building simply is not offered until it lands. So health
 * is what the preview waits for, not readiness to build a list.
 */
async function waitForHealth(url: string) {
  const deadline = Date.now() + 5 * 60_000
  let lastFailure = 'no response'
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.status === 200) return
      lastFailure = `status ${response.status}`
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error)
    }
    await sleep(5_000)
  }
  throw new Error(`Timed out waiting for ${url} (${lastFailure})`)
}

async function deploy() {
  const prNumber = requirePrNumber()
  const name = nameFor(prNumber)
  const host = hostFor(prNumber)
  const image = requireEnv('PREVIEW_IMAGE')
  const registryUsername = process.env.PREVIEW_REGISTRY_USERNAME?.trim() || null
  const registryPassword = process.env.PREVIEW_REGISTRY_PASSWORD?.trim() || null

  let application = await findApplication(name)
  if (!application) {
    await api('application.create', { body: { name, appName: name, environmentId: requireEnv('DOKPLOY_ENVIRONMENT_ID') } })
    application = await findApplication(name)
    if (!application) throw new Error(`Dokploy did not report ${name} after creating it`)
  }

  const applicationId = application.applicationId
  const details = await api<{ domains?: { host: string }[] } | undefined>('application.one', { query: { applicationId } })
  if (!details?.domains?.some((domain) => domain.host === host)) {
    await api('domain.create', {
      body: { applicationId, host, path: '/', port: PORT, https: true, certificateType: 'letsencrypt', domainType: 'application' },
    })
  }
  await api('application.saveDockerProvider', {
    body: {
      applicationId,
      dockerImage: image,
      username: registryUsername,
      password: registryPassword,
      registryUrl: registryUsername ? image.split('/')[0] : null,
    },
  })
  // The canonical host is enforced by the app, so a preview has to be told its own.
  await api('application.saveEnvironment', {
    body: { applicationId, env: `APP_URL=https://${host}\n`, buildArgs: null, buildSecrets: null, createEnvFile: false },
  })
  await api('application.deploy', { body: { applicationId } })
  await waitForDeployment(applicationId)

  const url = `https://${host}`
  await waitForHealth(`${url}/api/health`)
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `preview-url=${url}\n`)
  console.log(`Preview ready at ${url}`)
}

async function remove() {
  const name = nameFor(requirePrNumber())
  const application = await findApplication(name)
  if (!application) {
    console.log(`No Dokploy application named ${name}`)
    return
  }
  await api('application.delete', { body: { applicationId: application.applicationId } })
  console.log(`Deleted ${name}`)
}

/** Sweeps up whatever a failed cleanup left behind, and nothing else. */
async function prune() {
  const open = new Set((process.env.OPEN_PR_NUMBERS ?? '').split(/\s+/).filter(Boolean))
  for (const application of await listApplications()) {
    const prNumber = application.name.match(/^praetorium-pr-(\d+)$/)?.[1]
    if (!prNumber) continue
    if (open.has(prNumber)) {
      console.log(`keep ${application.name}`)
      continue
    }
    console.log(`delete ${application.name}`)
    await api('application.delete', { body: { applicationId: application.applicationId } })
  }
}

const command = process.argv[2]
if (command === 'deploy') await deploy()
else if (command === 'delete') await remove()
else if (command === 'prune') await prune()
else {
  console.error('Usage: previewDeploy.ts <deploy|delete|prune>')
  process.exit(1)
}
