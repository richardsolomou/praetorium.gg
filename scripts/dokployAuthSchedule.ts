import path from 'node:path'
import { pathToFileURL } from 'node:url'

const name = 'production auth backup to R2'
const command = 'node /app/scripts/nodeAuthBackup.ts backup /data/auth.sqlite production'
const cronExpression = '17 * * * *'

function required(environment: NodeJS.ProcessEnv, key: string) {
  const value = environment[key]
  if (!value) throw new Error(`${key} is required`)
  return value
}

export async function verifyProductionAuthBackup(environment: NodeJS.ProcessEnv, request: typeof fetch = fetch) {
  const origin = new URL(required(environment, 'DOKPLOY_URL'))
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid Dokploy URL')
  const applicationId = required(environment, 'DOKPLOY_APPLICATION_ID')
  const environmentId = required(environment, 'DOKPLOY_ENVIRONMENT_ID')
  const apiKey = required(environment, 'DOKPLOY_API_KEY')
  const api = async <T>(procedure: string, body?: Record<string, unknown>, query?: Record<string, string>): Promise<T> => {
    const url = new URL(`/api/${procedure}`, origin)
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value)
    const response = await request(url, {
      method: body ? 'POST' : 'GET',
      headers: { 'x-api-key': apiKey, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(180_000),
    })
    if (!response.ok) throw new Error(`Dokploy ${procedure} failed with HTTP ${response.status}`)
    return (await response.json()) as T
  }
  const application = await api<{ applicationId: string; environmentId: string; name: string }>('application.one', undefined, {
    applicationId,
  })
  if (application.applicationId !== applicationId || application.environmentId !== environmentId || application.name !== 'web') {
    throw new Error('Unexpected production Dokploy application')
  }
  type Schedule = {
    scheduleId: string
    name: string
    applicationId: string
    scheduleType: string
    command: string
    cronExpression: string
    shellType: string
    timezone: string | null
    enabled: boolean
  }
  const schedules = await api<Schedule[]>('schedule.list', undefined, { id: applicationId, scheduleType: 'application' })
  if (!Array.isArray(schedules)) throw new Error('Dokploy returned an invalid schedule list')
  const matching = schedules.filter((schedule) => schedule.name === name)
  if (matching.length > 1) throw new Error('Duplicate production auth backup schedules')
  let schedule = matching[0]
  if (schedule) {
    if (
      schedule.applicationId !== applicationId ||
      schedule.scheduleType !== 'application' ||
      schedule.command !== command ||
      schedule.cronExpression !== cronExpression ||
      schedule.shellType !== 'bash' ||
      schedule.timezone !== 'UTC' ||
      !schedule.enabled
    ) {
      throw new Error('Production auth backup schedule differs from the verified configuration')
    }
  } else {
    schedule = await api<Schedule>('schedule.create', {
      name,
      description: 'Verified SQLite and auth secret archive in the private R2 bucket',
      applicationId,
      scheduleType: 'application',
      command,
      cronExpression,
      shellType: 'bash',
      timezone: 'UTC',
      enabled: true,
    })
  }
  if (!schedule?.scheduleId) throw new Error('Dokploy did not create the auth backup schedule')
  const run = await api<{ status: string }>('schedule.runManually', { scheduleId: schedule.scheduleId })
  if (run.status !== 'done') throw new Error('Production auth backup and restore verification failed')
  console.log(`Verified production auth backup schedule ${schedule.scheduleId}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await verifyProductionAuthBackup(process.env)
}
