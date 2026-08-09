import { getRequest } from '@tanstack/react-start/server'
import { requireSameOrigin } from 'ras-stack/auth'

/**
 * The request must carry an Origin belonging to this deployment. `APP_URL` is
 * only needed when the reverse proxy cannot pass the public host through.
 */
export function requireMutationOrigin(request = getRequest()) {
  return requireSameOrigin(request, { configured: [process.env.APP_URL], trustForwardedHeaders: true })
}
