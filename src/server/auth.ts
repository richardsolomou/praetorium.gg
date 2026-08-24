import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { admin, twoFactor } from 'better-auth/plugins'
import { and, eq, notExists, sql } from 'drizzle-orm'
import { configuredProviderOptions, standardRateLimitOptions, standardSessionOptions, trustedOrigins } from 'ras-stack/auth'
import { PASSWORD_MIN_LENGTH, SOCIAL_PROVIDERS } from '../authConfig'
import { type ValkeyClient, valkeySecondaryStorage } from '../adapters/valkey'
import type { PraetoriumDatabase } from '../db/connection'
import { schema, user } from '../db/schema'
import { profileUpdate } from './profile'

export function createAuth(database: PraetoriumDatabase, secret: string, valkey?: ValkeyClient) {
  const claimInitialAdmin = async (userId: string) => {
    await database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(4021970612)`)
      await tx
        .update(user)
        .set({ role: 'admin' })
        .where(and(eq(user.id, userId), notExists(tx.select({ id: user.id }).from(user).where(eq(user.role, 'admin')))))
    })
  }

  return betterAuth({
    database: drizzleAdapter(database, { provider: 'pg', schema }),
    // Sessions and limiter counts live in Valkey when there is one, so a request
    // that only needs to know who is asking does not reach Postgres, and a
    // per-IP ceiling is shared by every replica instead of held once apiece.
    ...(valkey ? { secondaryStorage: valkeySecondaryStorage(valkey) } : {}),
    secret,
    baseURL: process.env.APP_URL?.trim() || undefined,
    // An account is who you are here, but it still needs no inbox: there is no
    // verification step to stall a first game.
    emailAndPassword: { enabled: true, minPasswordLength: PASSWORD_MIN_LENGTH, autoSignIn: true, requireEmailVerification: false },
    socialProviders: configuredProviderOptions(SOCIAL_PROVIDERS),
    // Signing in with Google to an account made with a password should land on the
    // same account, not a second one.
    account: { accountLinking: { enabled: true, trustedProviders: [...SOCIAL_PROVIDERS] } },
    disabledPaths: ['/unlink-account', '/admin/set-role'],
    databaseHooks: {
      user: {
        update: {
          before: async (data, context) => {
            if (context?.path !== '/update-user') return
            const result = await profileUpdate(data)
            if (!result.ok) throw new APIError('BAD_REQUEST', { message: result.error })
            return { data: result.data }
          },
        },
      },
      account: { create: { after: async (created) => claimInitialAdmin(created.userId) } },
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
    rateLimit: {
      ...standardRateLimitOptions(),
      enabled: process.env.AUTH_RATE_LIMIT !== 'off',
      // Counting in Valkey is one atomic increment; counting in the database is a
      // row read and a row write on every request that passes through here.
      ...(valkey ? { storage: 'secondary-storage' as const } : {}),
    },
    session: {
      ...standardSessionOptions(),
      /*
       * Most requests need only to know who is asking, and a signed cookie can
       * say so without any storage at all.
       *
       * The window is the cost: a session revoked elsewhere stays usable until
       * the cookie's copy expires. A minute keeps that short enough to be a
       * rounding error on sign-out while still taking the lookup off the great
       * majority of requests.
       */
      cookieCache: { enabled: true, maxAge: 60 },
    },
    advanced: {
      useSecureCookies: (process.env.APP_URL ?? '').startsWith('https://'),
      // Behind a reverse proxy, the socket address would put every visitor into
      // one rate-limit bucket.
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'] },
    },
    trustedOrigins: trustedOrigins({ trustForwardedHeaders: true }),
    plugins: [
      admin({
        adminRoles: ['admin'],
        defaultRole: 'user',
        allowImpersonatingAdmins: true,
        impersonationSessionDuration: 60 * 60,
      }),
      twoFactor({ issuer: 'Praetorium', allowPasswordless: true }),
    ],
  })
}
