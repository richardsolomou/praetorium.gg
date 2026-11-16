import { definePlugin } from 'nitro'
import { useNitroHooks } from 'nitro/app'
import { publicAssetsBaseUrl } from './objectStorage'
import { runtimeContentSecurityPolicy } from './runtimeContentSecurityPolicy'

export default definePlugin(() => {
  const origin = new URL(publicAssetsBaseUrl()).origin
  useNitroHooks().hook('response', (event) => {
    const csp = event.headers.get('content-security-policy')
    if (!csp) return
    const updated = runtimeContentSecurityPolicy(csp, origin, Boolean(process.env.SPACETIME_URL))
    if (updated !== csp) event.headers.set('content-security-policy', updated)
  })
})
