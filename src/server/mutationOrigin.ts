import { requireTanStackMutationOrigin } from 'ras-stack/tanstack/server'
import { deploymentOrigins } from './requestOrigin'

/**
 * The request must carry an Origin belonging to this deployment. `APP_URL` is
 * only needed when the reverse proxy cannot pass the public host through.
 */
export function requireMutationOrigin(request?: Request) {
  return requireTanStackMutationOrigin(deploymentOrigins(), request)
}
