import { definePlugin } from 'nitro'
import { useNitroHooks } from 'nitro/app'
import { publicAssetsBaseUrl } from './objectStorage'
import { contentSecurityPolicy } from './contentSecurityPolicy'

export default definePlugin(() => {
  const origin = new URL(publicAssetsBaseUrl()).origin
  useNitroHooks().hook('response', (event) => {
    const csp = event.headers.get('content-security-policy')
    if (!csp) return
    const updated = contentSecurityPolicy(csp, [origin, 'https://s3.praetorium.gg'], Boolean(process.env.SPACETIME_URL))
    if (updated !== csp) event.headers.set('content-security-policy', updated)
  })
})
