import { createAuthClient } from 'better-auth/react'
import { adminClient, oneTimeTokenClient, twoFactorClient } from 'better-auth/client/plugins'

/** Same origin, so nothing needs configuring. */
export const authClient = createAuthClient({ plugins: [adminClient(), oneTimeTokenClient(), twoFactorClient()] })
