import { requireTanStackMutationOrigin } from 'ras-stack/tanstack/server'

/**
 * The request must carry an Origin belonging to this deployment. `APP_URL` is
 * only needed when the reverse proxy cannot pass the public host through.
 */
export function requireMutationOrigin(request?: Request) {
  return requireTanStackMutationOrigin({ configured: [process.env.APP_URL], trustForwardedHeaders: true }, request)
}
