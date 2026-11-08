import fs from 'node:fs'
import path from 'node:path'
import { deploymentHost, reportServerFailure } from '../adapters/posthog'
import { replaceFileSync } from './replaceFile'

/** Reports a production start on the same revision as the previous one, which is a restart no deploy explains. */
export function recordServerStart(environment: NodeJS.ProcessEnv = process.env) {
  const revision = environment.GITHUB_SHA?.trim()
  if (!revision || deploymentHost(environment.APP_URL) !== 'praetorium.gg') return
  const file = path.join(path.resolve(environment.DATA_DIR ?? '/data'), 'last-start-revision')
  try {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === revision) {
      reportServerFailure({ event: 'server_restarted_same_revision', revision })
    }
    replaceFileSync(file, (temporary) => fs.writeFileSync(temporary, revision))
  } catch (error) {
    reportServerFailure({ event: 'server_start_record_failed', error }, 'warn')
  }
}
