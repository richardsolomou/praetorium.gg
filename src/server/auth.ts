import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { configuredProviderOptions, standardRateLimitOptions, standardSessionOptions, trustedOrigins } from 'ras-stack/auth'
import { PASSWORD_MIN_LENGTH, SOCIAL_PROVIDERS } from '../authConfig'
import type { PraetoriumDatabase } from '../db/connection'
import { schema } from '../db/schema'
import { profileUpdate } from './profile'

export function createAuth(database: PraetoriumDatabase, secret: string) {
  return betterAuth({
    database: drizzleAdapter(database, { provider: 'sqlite', schema }),
    secret,
    baseURL: process.env.APP_URL?.trim() || undefined,
    // An account is who you are here, but it still needs no inbox: there is no
    // verification step to stall a first game.
    emailAndPassword: { enabled: true, minPasswordLength: PASSWORD_MIN_LENGTH, autoSignIn: true, requireEmailVerification: false },
    socialProviders: configuredProviderOptions(SOCIAL_PROVIDERS),
    // Signing in with Google to an account made with a password should land on the
    // same account, not a second one.
    account: { accountLinking: { enabled: true, trustedProviders: [...SOCIAL_PROVIDERS] } },
    databaseHooks: {
      user: {
        update: {
          before: async (data, context) => {
            if (context?.path !== '/update-user') return
            const result = profileUpdate(data)
            if (!result.ok) throw new APIError('BAD_REQUEST', { message: result.error })
            return { data: result.data }
          },
        },
      },
    },
    /*
     * Limits are per IP, and two people at the same table share one: a pair signing
     * up in the same room must not lock each other out. Generous enough for that,
     * tight enough to make guessing a password pointless.
     *
     * `AUTH_RATE_LIMIT=off` is for the browser suite, which makes an account per
     * spec from one unresolvable address and would otherwise throttle itself into
     * failing — slowly, and somewhere other than the request that was refused.
     */
    rateLimit: { ...standardRateLimitOptions(), enabled: process.env.AUTH_RATE_LIMIT !== 'off' },
    session: standardSessionOptions(),
    advanced: {
      useSecureCookies: (process.env.APP_URL ?? '').startsWith('https://'),
      // Behind a reverse proxy, the socket address would put every visitor into
      // one rate-limit bucket.
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'] },
    },
    trustedOrigins: trustedOrigins({ trustForwardedHeaders: true }),
  })
}
