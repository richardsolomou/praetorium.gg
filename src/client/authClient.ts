import { createAuthClient } from 'better-auth/react'
import { adminClient, oneTimeTokenClient, twoFactorClient } from 'better-auth/client/plugins'
import { oauthProviderClient } from '@better-auth/oauth-provider/client'
import { holdingReload } from './pendingWrites'

/** Same origin, so only the reload hold for account changes needs configuring. */
export const authClient = createAuthClient({
  plugins: [adminClient(), oneTimeTokenClient(), twoFactorClient(), oauthProviderClient()],
  fetchOptions: {
    customFetchImpl: (input, init) => (init?.method && init.method !== 'GET' ? holdingReload(fetch(input, init)) : fetch(input, init)),
  },
})

export function authRedirectUrl(data: unknown) {
  if (!data || typeof data !== 'object' || !('url' in data) || typeof data.url !== 'string') return null
  return data.url
}
