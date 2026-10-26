import { isEntryPoint } from './lib/entryPoint.ts'
import { dokployWebApplication } from './lib/dokployWeb.ts'

const name = 'production auth backup to R2'
const command = 'node /app/scripts/nodeAuthBackup.ts backup /data/auth.sqlite production'
const cronExpression = '17 * * * *'

export async function verifyProductionAuthBackup(environment: NodeJS.ProcessEnv, request: typeof fetch = fetch) {
  const { api, applicationId, inspect } = dokployWebApplication(environment, request, 180_000)
  await inspect()
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
  const schedules = await api<Schedule[]>('schedule.list', { query: { id: applicationId, scheduleType: 'application' } })
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
      body: {
        name,
        description: 'Verified SQLite and auth secret archive in the private R2 bucket',
        applicationId,
        scheduleType: 'application',
        command,
        cronExpression,
        shellType: 'bash',
        timezone: 'UTC',
        enabled: true,
      },
    })
  }
  if (!schedule?.scheduleId) throw new Error('Dokploy did not create the auth backup schedule')
  const run = await api<{ status: string }>('schedule.runManually', { body: { scheduleId: schedule.scheduleId } })
  if (run.status !== 'done') throw new Error('Production auth backup and restore verification failed')
  console.log(`Verified production auth backup schedule ${schedule.scheduleId}`)
}

if (isEntryPoint(import.meta.url)) {
  await verifyProductionAuthBackup(process.env)
}
