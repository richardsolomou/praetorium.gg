import { createAuthClient } from 'better-auth/react'
import { adminClient, oneTimeTokenClient, twoFactorClient } from 'better-auth/client/plugins'
import { oauthProviderClient } from '@better-auth/oauth-provider/client'

/** Same origin, so nothing needs configuring. */
export const authClient = createAuthClient({ plugins: [adminClient(), oneTimeTokenClient(), twoFactorClient(), oauthProviderClient()] })

export function authRedirectUrl(data: unknown) {
  if (!data || typeof data !== 'object' || !('url' in data) || typeof data.url !== 'string') return null
  return data.url
}
