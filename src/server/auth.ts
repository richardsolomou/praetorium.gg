import type { Account, GenericEndpointContext } from 'better-auth'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { applySetCookies } from 'better-auth/cookies'
import { decryptOAuthToken } from 'better-auth/oauth2'
import { admin, oneTimeToken, twoFactor } from 'better-auth/plugins'
import { and, count, eq, inArray, notExists, sql } from 'drizzle-orm'
import {
  standardAccountOptions,
  standardEmailAndPasswordOptions,
  standardRateLimitOptions,
  standardSessionOptions,
  trustedOrigins,
} from 'ras-stack/auth'
import { createAuthEmailHandler, type EmailDelivery } from 'ras-stack/email'
import type { valkeySecondaryStorage } from '../adapters/valkey'
import { PASSWORD_MIN_LENGTH, SOCIAL_PROVIDERS } from '../authConfig'
import type { PraetoriumDatabase } from '../db/connection'
import { account, battles, battleUsers, schema, user } from '../db/schema'
import { APPLE_AUTH_ORIGIN, appleCredentials, revokeAppleToken } from './appleAuth'
import { storeProfileImageFromUrl } from './avatarStorage'
import { configuredAuthProviderOptions, configuredAuthProviders } from './authProviders'
import { profileUpdate } from './profile'
import { nativeAuthToken } from './nativeAuthToken'

type AuthStorage = ReturnType<typeof valkeySecondaryStorage>

function isNativeOAuthState(value: string, state: string, provider: string, baseURL: string) {
  try {
    const stored = JSON.parse(value) as Record<string, unknown>
    if (stored.oauthState !== state || typeof stored.expiresAt !== 'number' || stored.expiresAt < Date.now()) return false
    if (typeof stored.callbackURL !== 'string' || stored.callbackURL !== stored.errorURL) return false
    const callback = new URL(stored.callbackURL, baseURL)
    const base = new URL(baseURL)
    const search = callback.searchParams
    const allowed = new Set(['action', 'bridge', 'challenge', 'complete', 'next', 'provider', 'requestSignUp'])
    if (callback.origin !== base.origin || callback.pathname !== '/native-auth') return false
    if ([...search.keys()].some((key) => !allowed.has(key))) return false
    if (search.get('action') !== 'sign-in' && search.get('action') !== 'link') return false
    if (search.get('provider') !== provider || !SOCIAL_PROVIDERS.includes(provider as (typeof SOCIAL_PROVIDERS)[number])) return false
    if (search.get('bridge') !== '2' && search.get('bridge') !== '3') return false
    if (!/^[-\w]{43}$/.test(search.get('challenge') ?? '') || search.get('complete') !== 'true') return false
    const next = search.get('next')
    return Boolean(next?.startsWith('/') && !next.startsWith('//'))
  } catch {
    return false
  }
}

export function createAuth(database: PraetoriumDatabase, secret: string, storage?: AuthStorage, email?: EmailDelivery) {
  const configuredApple = appleCredentials()
  const sendResetPassword = email
    ? createAuthEmailHandler(email, ({ user: resetting, url }) => ({
        to: resetting.email,
        subject: 'Reset your Praetorium password',
        text: `Reset your Praetorium password using this link: ${url}\n\nThis link expires in one hour.`,
        html: `<p>Reset your Praetorium password using the link below.</p><p><a href="${url}">Reset password</a></p><p>This link expires in one hour.</p>`,
      }))
    : undefined
  const sendVerificationEmail = email
    ? createAuthEmailHandler(email, ({ user: verifying, url }) => ({
        to: verifying.email,
        subject: 'Verify your Praetorium email address',
        text: `Verify your Praetorium email address using this link: ${url}\n\nThis link expires in one hour.`,
        html: `<p>Verify your Praetorium email address using the link below.</p><p><a href="${url}">Verify email address</a></p><p>This link expires in one hour.</p>`,
      }))
    : undefined
  const claimInitialAdmin = async (userId: string) => {
    const promoted = await database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(4021970612)`)
      const [claimed] = await tx
        .update(user)
        .set({ role: 'admin' })
        .where(and(eq(user.id, userId), notExists(tx.select({ id: user.id }).from(user).where(eq(user.role, 'admin')))))
        .returning()
      return claimed
    })
    if (promoted) await (await auth.$context).internalAdapter.refreshUserSessions(promoted)
  }

  const deleteUserData = async (userId: string) => {
    await database
      .delete(battles)
      .where(inArray(battles.id, database.select({ id: battleUsers.battleId }).from(battleUsers).where(eq(battleUsers.userId, userId))))
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

  // A brand-new social sign-up already carries the provider's avatar on `data.image`
  // (better-auth's own default), but as the provider's raw URL rather than one of our own —
  // rehost it up front so `user.image` is always empty or one of our own short S3 URLs, matching
  // an upload, and safe to echo straight back on the next profile save.
  const rehostSocialAvatarOnSignUp = async (data: { image?: string | null }) => {
    if (!data.image) return
    const stored = await storeProfileImageFromUrl(data.image)
    return { data: { ...data, image: stored } }
  }

  // Linking a social provider to an existing account does not touch `user.image` by default.
  // When the account just linked (or the one just created) belongs to a user with no picture yet,
  // fetch the provider's avatar with the tokens better-auth just stored and adopt it — leaving an
  // existing picture untouched.
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
    const stored = await storeProfileImageFromUrl(info.user.image)
    if (!stored) return
    const [updated] = await database.update(user).set({ image: stored }).where(eq(user.id, created.userId)).returning()
    if (updated) await (await auth.$context).internalAdapter.refreshUserSessions(updated)
  }

  const auth = betterAuth({
    database: drizzleAdapter(database, { provider: 'pg', schema }),
    // Sessions and limiter counts live in Valkey when there is one, so a request
    // that only needs to know who is asking does not reach Postgres, and a
    // per-IP ceiling is shared by every replica instead of held once apiece.
    ...(storage ? { secondaryStorage: storage } : {}),
    secret,
    baseURL: process.env.APP_URL?.trim() || undefined,
    emailAndPassword: standardEmailAndPasswordOptions({
      minPasswordLength: PASSWORD_MIN_LENGTH,
      autoSignIn: true,
      requireEmailVerification: false,
      ...(sendResetPassword ? { sendResetPassword } : {}),
    }),
    emailVerification: sendVerificationEmail
      ? {
          sendOnSignUp: true,
          sendVerificationEmail,
        }
      : undefined,
    socialProviders: configuredAuthProviderOptions(),
    account: standardAccountOptions({
      accountLinking: { enabled: true, trustedProviders: [...SOCIAL_PROVIDERS] },
    }),
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (deleted) => {
          await revokeAppleUser(deleted.id)
          await deleteUserData(deleted.id)
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
            const result = await profileUpdate(data)
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
      ...(storage ? { storage: 'secondary-storage' as const } : {}),
    },
    session: standardSessionOptions(),
    advanced: {
      useSecureCookies: (process.env.APP_URL ?? '').startsWith('https://'),
      cookies: { state: { attributes: { sameSite: 'none' } } },
      // Behind a reverse proxy, the socket address would put every visitor into
      // one rate-limit bucket.
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'] },
    },
    trustedOrigins: trustedOrigins({
      trustForwardedHeaders: true,
      configured: configuredAuthProviders().includes('apple') ? [APPLE_AUTH_ORIGIN] : [],
    }),
    plugins: [
      admin({
        adminRoles: ['admin'],
        defaultRole: 'user',
        allowImpersonatingAdmins: false,
        impersonationSessionDuration: 60 * 60,
      }),
      oneTimeToken({ expiresIn: 3, storeToken: 'hashed' }),
      nativeAuthToken(),
      twoFactor({ issuer: 'Praetorium' }),
    ],
  })

  const changeUserRole = async (actorId: string, targetId: string, role: 'admin' | 'user') => {
    const result = await database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(4021970613)`)
      const [actor] = await tx.select({ role: user.role }).from(user).where(eq(user.id, actorId)).limit(1)
      if (actor?.role !== 'admin') return { status: 'forbidden' as const }
      if (actorId === targetId) return { status: 'self' as const }
      const [target] = await tx.select().from(user).where(eq(user.id, targetId)).limit(1)
      if (!target) return { status: 'missing' as const }
      if (target.role === 'admin' && role === 'user') {
        const [administrators] = await tx.select({ count: count() }).from(user).where(eq(user.role, 'admin'))
        if ((administrators?.count ?? 0) <= 1) return { status: 'last-admin' as const }
      }
      await tx.update(user).set({ role }).where(eq(user.id, targetId))
      return { status: 'changed' as const }
    })
    if (result.status === 'changed') {
      await database.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(4021970613)`)
        const [current] = await tx.select().from(user).where(eq(user.id, targetId)).limit(1)
        if (current) await (await auth.$context).internalAdapter.refreshUserSessions(current)
      })
    }
    return result.status
  }

  const deleteAppleAccount = async (subject: string) => {
    const [linked] = await database
      .select({ userId: account.userId })
      .from(account)
      .where(and(eq(account.providerId, 'apple'), eq(account.accountId, subject)))
      .limit(1)
    if (!linked) return
    await deleteUserData(linked.userId)
    const context = await auth.$context
    await context.internalAdapter.deleteUser(linked.userId)
    await context.internalAdapter.deleteUserSessions(linked.userId)
  }

  return Object.assign(auth, { changeUserRole, deleteAppleAccount, revokeAppleTokens, revokeAppleUser })
}
