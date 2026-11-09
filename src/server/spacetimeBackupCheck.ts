import { deploymentHost, reportServerFailure } from '../adapters/posthog'
import { privateR2Client, r2Objects } from './r2Client.ts'

// Backups run every six hours, so one failed run stays quiet and the second alerts.
const staleAfterHours = 13
const hour = 60 * 60 * 1000

type BackupObjects = Pick<ReturnType<typeof r2Objects>, 'get'>

function productionBackups(environment: NodeJS.ProcessEnv) {
  const r2 = privateR2Client(environment)
  if (!r2) throw new Error('R2 backup credentials are required')
  return r2Objects(r2)
}

/** Watches the published backup rather than the backup job, so a job that never starts is caught too. */
export async function checkSpacetimeBackup(environment: NodeJS.ProcessEnv = process.env, backups?: BackupObjects, now = Date.now()) {
  if (deploymentHost(environment.APP_URL) !== 'praetorium.gg') return
  try {
    const pointer = await (backups ?? productionBackups(environment)).get(`${environment.SPACETIME_INTERNAL_HOST}/backups/latest.json`)
    if (!pointer) throw new Error('No published SpacetimeDB backup')
    const { createdAt } = JSON.parse(new TextDecoder().decode(pointer)) as { createdAt: string }
    const ageHours = (now - Date.parse(createdAt)) / hour
    if (!(ageHours <= staleAfterHours)) reportServerFailure({ event: 'spacetime_backup_stale', createdAt, ageHours: Math.round(ageHours) })
  } catch (error) {
    reportServerFailure({ event: 'spacetime_backup_check_failed', error })
  }
}
