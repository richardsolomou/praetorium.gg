import type { Account, GenericEndpointContext } from 'better-auth'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthEndpoint, createAuthMiddleware } from 'better-auth/api'
import { applySetCookies } from 'better-auth/cookies'
import { decryptOAuthToken } from 'better-auth/oauth2'
import { admin, jwt, oneTimeToken, twoFactor } from 'better-auth/plugins'
import { and, eq, notExists, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import {
  standardAccountOptions,
  standardEmailAndPasswordOptions,
  standardRateLimitOptions,
  standardSessionOptions,
  trustedOrigins,
} from 'ras-stack/auth'
import { standardAuthEmails, type EmailDelivery } from 'ras-stack/email'
import { PASSWORD_MIN_LENGTH, SOCIAL_PROVIDERS } from '../authConfig'
import { account, schema, user } from '../db/d1AuthSchema'
import { APPLE_AUTH_ORIGIN, appleCredentials, revokeAppleToken } from './appleAuth'
import { configuredAuthProviderOptions, configuredAuthProviders } from './authProviders'
import { nativeAuthToken } from './nativeAuthToken'
import { isNativeOAuthState } from './nativeOAuthState'

type Environment = NodeJS.ProcessEnv

type D1AuthOptions = {
  environment: Environment
  email?: EmailDelivery
  deleteUserData: (userId: string) => Promise<void>
  revokeSessionAccess: (sessionId: string) => Promise<void>
  storeSocialAvatar: (url: string) => Promise<string | null>
  updateProfile: (data: Record<string, unknown>) => Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }>
}

export function createD1Auth(binding: Parameters<typeof drizzle>[0], secret: string, options: D1AuthOptions) {
  const database = drizzle(binding, { schema })
  const environment = options.environment
  const issuer = new URL('/api/auth', environment.APP_URL).toString()
  const audience = environment.SPACETIME_AUDIENCE
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(audience ?? '')) throw new Error('SPACETIME_AUDIENCE is required')
  const configuredApple = appleCredentials(environment)
  const authEmails = options.email ? standardAuthEmails(options.email, { productName: 'Praetorium' }) : undefined

  const claimInitialAdmin = async (userId: string) => {
    const [promoted] = await database
      .update(user)
      .set({ role: 'admin' })
      .where(and(eq(user.id, userId), notExists(database.select({ id: user.id }).from(user).where(eq(user.role, 'admin')))))
      .returning()
    if (promoted) await (await auth.$context).internalAdapter.refreshUserSessions(promoted)
  }

  const revokeAppleTokens = async (linked: { accessToken: string | null; refreshToken: string | null }) => {
    if (!configuredApple) return
    try {
      const context = (await auth.$context) as unknown as GenericEndpointContext['context']
      const refreshToken = linked.refreshToken ? await decryptOAuthToken(linked.refreshToken, context) : undefined
      const accessToken = linked.accessToken ? await decryptOAuthToken(linked.accessToken, context) : undefined
      const token = refreshToken
        ? { token: refreshToken, type: 'refresh_token' as const }
        : accessToken
          ? { token: accessToken, type: 'access_token' as const }
          : undefined
      if (token) await revokeAppleToken(configuredApple, token)
    } catch {
      const context = await auth.$context
      context.logger.error('Apple token revocation failed before account removal')
    }
  }

  const revokeAppleUser = async (userId: string) => {
    const [linked] = await database
      .select({ accessToken: account.accessToken, refreshToken: account.refreshToken })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, 'apple')))
      .limit(1)
    if (linked) await revokeAppleTokens(linked)
  }

  const rehostSocialAvatarOnSignUp = async (data: { image?: string | null }) => {
    if (!data.image) return
    const stored = await options.storeSocialAvatar(data.image)
    return { data: { ...data, image: stored } }
  }

  const applySocialAvatarIfMissing = async (created: Account, context: GenericEndpointContext | null) => {
    if (!SOCIAL_PROVIDERS.includes(created.providerId as (typeof SOCIAL_PROVIDERS)[number]) || !context) return
    const [existing] = await database.select({ image: user.image }).from(user).where(eq(user.id, created.userId)).limit(1)
    if (!existing || existing.image) return
    const provider = context.context.socialProviders.find((candidate) => candidate.id === created.providerId)
    if (!provider) return
    const info = await provider
      .getUserInfo({
        accessToken: created.accessToken ? await decryptOAuthToken(created.accessToken, context.context) : undefined,
        refreshToken: created.refreshToken ? await decryptOAuthToken(created.refreshToken, context.context) : undefined,
        idToken: created.idToken ?? undefined,
      })
      .catch(() => null)
    if (!info?.user.image) return
    const stored = await options.storeSocialAvatar(info.user.image)
    if (!stored) return
    const [updated] = await database.update(user).set({ image: stored }).where(eq(user.id, created.userId)).returning()
    if (updated) await (await auth.$context).internalAdapter.refreshUserSessions(updated)
  }

  const auth = betterAuth({
    database: drizzleAdapter(database, { provider: 'sqlite', schema }),
    secret,
    baseURL: environment.APP_URL?.trim() || undefined,
    emailAndPassword: standardEmailAndPasswordOptions({
      minPasswordLength: PASSWORD_MIN_LENGTH,
      autoSignIn: true,
      requireEmailVerification: false,
      ...(authEmails ? { sendResetPassword: authEmails.sendResetPassword } : {}),
    }),
    emailVerification: authEmails ? { sendOnSignUp: true, sendVerificationEmail: authEmails.sendVerificationEmail } : undefined,
    socialProviders: configuredAuthProviderOptions(environment),
    account: standardAccountOptions({ accountLinking: { enabled: true, trustedProviders: [...SOCIAL_PROVIDERS] } }),
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (deleted) => {
          await revokeAppleUser(deleted.id)
          await options.deleteUserData(deleted.id)
        },
      },
    },
    disabledPaths: [
      '/unlink-account',
      '/admin/set-role',
      '/admin/update-user',
      '/admin/remove-user',
      '/admin/ban-user',
      '/admin/unban-user',
    ],
    databaseHooks: {
      user: {
        create: { before: rehostSocialAvatarOnSignUp },
        update: {
          before: async (data, context) => {
            if (context?.path !== '/update-user') return
            const result = await options.updateProfile(data)
            if (!result.ok) throw new APIError('BAD_REQUEST', { message: result.error })
            return { data: result.data }
          },
        },
      },
      account: {
        create: {
          after: async (created, context) => {
            await claimInitialAdmin(created.userId)
            await applySocialAvatarIfMissing(created, context)
          },
        },
      },
      session: { delete: { before: async (session) => options.revokeSessionAccess(session.id) } },
    },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (!context.path.startsWith('/callback/')) return
        const provider = context.params?.id ?? context.path.split('/').pop()
        const state = context.query?.state
        if (typeof provider !== 'string' || typeof state !== 'string') return
        const stored = await context.context.internalAdapter.findVerificationValue(state)
        if (!stored || !isNativeOAuthState(stored.value, state, provider, context.context.baseURL)) return
        const stateCookie = context.context.createAuthCookie('state')
        const signedCookie = await context.setSignedCookie(stateCookie.name, state, context.context.secret, stateCookie.attributes)
        const headers = new Headers(context.request?.headers ?? context.headers)
        applySetCookies(headers, [signedCookie])
        return { context: { headers } }
      }),
    },
    rateLimit: { ...standardRateLimitOptions(), enabled: environment.AUTH_RATE_LIMIT !== 'off' },
    session: standardSessionOptions(),
    advanced: {
      disableOriginCheck: false,
      useSecureCookies: (environment.APP_URL ?? '').startsWith('https://'),
      cookies: { state: { attributes: { sameSite: 'none' } } },
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'] },
    },
    trustedOrigins: trustedOrigins({
      trustForwardedHeaders: true,
      configured: configuredAuthProviders(environment).includes('apple') ? [APPLE_AUTH_ORIGIN] : [],
    }),
    plugins: [
      admin({ adminRoles: ['admin'], defaultRole: 'user', allowImpersonatingAdmins: false, impersonationSessionDuration: 60 * 60 }),
      oneTimeToken({ expiresIn: 3, storeToken: 'hashed' }),
      nativeAuthToken(),
      twoFactor({ issuer: 'Praetorium' }),
      jwt({
        jwks: { keyPairConfig: { alg: 'ES256' } },
        jwt: {
          issuer,
          audience,
          expirationTime: '5m',
          getSubject: ({ session }) => session.id,
          definePayload: ({ session, user: currentUser }) => {
            const expiresAt = Math.min(Math.floor(Date.now() / 1000) + 300, Math.floor(session.expiresAt.getTime() / 1000))
            return { userId: currentUser.id, accessExpiresAt: expiresAt, tokenType: 'spacetime-access', exp: expiresAt }
          },
        },
      }),
      {
        id: 'praetorium-spacetime-discovery',
        endpoints: {
          spacetimeOpenIdConfiguration: createAuthEndpoint('/.well-known/openid-configuration', { method: 'GET' }, (context) =>
            context.json({
              issuer,
              jwks_uri: `${issuer}/jwks`,
              id_token_signing_alg_values_supported: ['ES256'],
              response_types_supported: ['token'],
              subject_types_supported: ['public'],
            }),
          ),
        },
      },
    ],
  })

  const changeUserRole = async (actorId: string, targetId: string, role: 'admin' | 'user') => {
    if (actorId === targetId) return 'self' as const
    const [changed] = await database
      .update(user)
      .set({ role })
      .where(
        and(
          eq(user.id, targetId),
          sql`exists (select 1 from user as actor where actor.id = ${actorId} and actor.role = 'admin')`,
          role === 'admin' ? undefined : sql`(${user.role} <> 'admin' or (select count(*) from user where role = 'admin') > 1)`,
        ),
      )
      .returning()
    if (changed) {
      await (await auth.$context).internalAdapter.refreshUserSessions(changed)
      return 'changed' as const
    }
    const [actor] = await database.select({ role: user.role }).from(user).where(eq(user.id, actorId)).limit(1)
    if (actor?.role !== 'admin') return 'forbidden' as const
    const [target] = await database.select({ role: user.role }).from(user).where(eq(user.id, targetId)).limit(1)
    if (!target) return 'missing' as const
    return 'last-admin' as const
  }

  const deleteAppleAccount = async (subject: string) => {
    const [linked] = await database
      .select({ userId: account.userId })
      .from(account)
      .where(and(eq(account.providerId, 'apple'), eq(account.accountId, subject)))
      .limit(1)
    if (!linked) return
    await options.deleteUserData(linked.userId)
    const context = await auth.$context
    await context.internalAdapter.deleteUser(linked.userId)
    await context.internalAdapter.deleteUserSessions(linked.userId)
  }

  return Object.assign(auth, { changeUserRole, deleteAppleAccount, revokeAppleTokens, revokeAppleUser })
}
