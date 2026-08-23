import { definePlugin } from 'nitro'
import { useNitroHooks } from 'nitro/app'
import { s3PublicBaseUrl } from './objectStorage'

/**
 * The `img-src` directive in `vite.config.ts` is fixed at build time, but where a profile
 * picture is actually served from is a runtime setting — the shared default for most
 * deployments, an operator's own store for the rest. Widening it here, once per response,
 * is what lets either kind of `S3_PUBLIC_BASE_URL` load without relaxing the policy generally.
 */
export default definePlugin(() => {
  const origin = new URL(s3PublicBaseUrl()).origin
  useNitroHooks().hook('response', (event) => {
    const csp = event.headers.get('content-security-policy')
    if (!csp || csp.includes(origin)) return
    event.headers.set('content-security-policy', csp.replace(/(img-src[^;]*)/, `$1 ${origin}`))
  })
})
