import { definePlugin } from 'nitro'
import { useNitroHooks } from 'nitro/app'
import { s3PublicBaseUrl } from './objectStorage'
import { contentSecurityPolicy } from './contentSecurityPolicy'

export default definePlugin(() => {
  const origin = new URL(s3PublicBaseUrl()).origin
  useNitroHooks().hook('response', (event) => {
    const csp = event.headers.get('content-security-policy')
    if (!csp) return
    const updated = contentSecurityPolicy(csp, origin, Boolean(process.env.SPACETIME_URL))
    if (updated !== csp) event.headers.set('content-security-policy', updated)
  })
})
