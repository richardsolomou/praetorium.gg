import type { Account, GenericEndpointContext } from 'better-auth'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { applySetCookies } from 'better-auth/cookies'
import { decryptOAuthToken } from 'better-auth/oauth2'
import { admin, jwt, oneTimeToken, twoFactor } from 'better-auth/plugins'
import { mcp } from '@better-auth/mcp'
import { cimd } from '@better-auth/cimd'
import { fetchClientMetadataResource } from '@better-auth/cimd/node'
import { and, desc, eq, gt, notExists, sql } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import pRetry from 'p-retry'
import {
  standardAccountOptions,
  standardEmailAndPasswordOptions,
  standardRateLimitOptions,
  standardSessionOptions,
  trustedOrigins,
} from 'ras-stack/auth'
import { standardAuthEmails, type EmailDelivery } from 'ras-stack/email'
import { PASSWORD_MIN_LENGTH, SOCIAL_PROVIDERS } from '../authConfig'
import { account, schema, session as sessionTable, user } from '../db/authSchema'
import { oauthSchema } from '../db/oauthSchema'
import { oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken } from '../db/oauthSchema'
import type { AdminConnection, AdminSession } from '../admin'
import { APPLE_AUTH_ORIGIN, appleCredentials, revokeAppleToken } from './appleAuth'
import { configuredAuthProviderOptions, configuredAuthProviders } from './authProviders'
import { nativeAuthToken } from './nativeAuthToken'
import { isNativeOAuthState } from './nativeOAuthState'

type Environment = NodeJS.ProcessEnv

function isSqliteBusy(error: unknown) {
  for (let current = error, depth = 0; current instanceof Error && depth < 4; current = current.cause, depth++) {
    if (current.message.includes('SQLITE_BUSY')) return true
  }
  return false
}

type AuthOptions = {
  environment: Environment
  email?: EmailDelivery
  userIdForNewAccount?: (email: string) => string
  deleteUserData: (userId: string) => Promise<void>
  revokeSessionAccess: (sessionId: string) => Promise<void>
  storeSocialAvatar: (url: string) => Promise<string | null>
  updateProfile: (data: Record<string, unknown>) => Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }>
  /** Called after a player links GitHub, so their sponsorship shows before they leave the callback. */
  githubLinked?: () => Promise<void>
}

export function createSqliteAuth(database: LibSQLDatabase<typeof schema>, secret: string, options: AuthOptions) {
  const environment = options.environment
  const authUrl = new URL('/api/auth', environment.APP_URL)
  const issuer = environment.SPACETIME_ISSUER ?? authUrl.toString()
  if (environment.SPACETIME_ISSUER) {
    const previewUrl = new URL(issuer)
    if (
      previewUrl.protocol !== 'https:' ||
      previewUrl.origin !== authUrl.origin ||
      !/^\/api\/auth\/preview\/[0-9a-f]{40}$/.test(previewUrl.pathname) ||
      previewUrl.username ||
      previewUrl.password ||
      previewUrl.search ||
      previewUrl.hash
    ) {
      throw new Error('Invalid SpacetimeDB preview issuer')
    }
  }
  const audience = environment.SPACETIME_AUDIENCE
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(audience ?? '')) throw new Error('SPACETIME_AUDIENCE is required')
  const configuredApple = appleCredentials(environment)
  const authEmails = options.email ? standardAuthEmails(options.email, { productName: 'Praetorium' }) : undefined

  const claimInitialAdmin = async (userId: string) => {
    const [promoted] = await pRetry(
      () =>
        database
          .update(user)
          .set({ role: 'admin' })
          .where(and(eq(user.id, userId), notExists(database.select({ id: user.id }).from(user).where(eq(user.role, 'admin')))))
          .returning(),
      {
        retries: 5,
        minTimeout: 20,
        maxTimeout: 250,
        maxRetryTime: 1_500,
        randomize: true,
        shouldRetry: ({ error }) => isSqliteBusy(error),
      },
    )
    if (promoted) await (await auth.$context).internalAdapter.refreshUserSessions(promoted)
  }

  // An administrator viewing as the player is not the player being active.
  const recordSeen = async (row: { userId?: string; updatedAt?: Date; impersonatedBy?: unknown }) => {
    if (!row.userId || !row.updatedAt || row.impersonatedBy) return
    await database.update(user).set({ lastSeenAt: row.updatedAt }).where(eq(user.id, row.userId))
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
    database: drizzleAdapter(database, { provider: 'sqlite', schema: { ...schema, ...oauthSchema } }),
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
    account: standardAccountOptions({
      accountLinking: { enabled: true, trustedProviders: [...SOCIAL_PROVIDERS], allowDifferentEmails: true },
    }),
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
      '/admin/create-user',
      '/admin/set-user-password',
      '/admin/list-user-sessions',
      '/admin/revoke-user-session',
      '/admin/revoke-user-sessions',
      '/admin/set-role',
      '/admin/update-user',
      '/admin/remove-user',
      '/admin/ban-user',
      '/admin/unban-user',
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (data) => {
            const avatar = await rehostSocialAvatarOnSignUp(data)
            if (!options.userIdForNewAccount) return avatar
            return { data: { ...avatar?.data, id: options.userIdForNewAccount(data.email) } }
          },
        },
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
            if (created.providerId === 'github')
              await options
                .githubLinked?.()
                .catch(async () => (await auth.$context).logger.error('GitHub sponsor refresh failed after linking'))
          },
        },
      },
      session: {
        create: { after: async (created) => recordSeen(created) },
        update: { after: async (updated) => recordSeen(updated) },
        delete: { before: async (deleted) => options.revokeSessionAccess(deleted.id) },
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
            return {
              userId: currentUser.id,
              accessExpiresAt: expiresAt,
              tokenType: 'spacetime-access',
              isAdmin: currentUser.role === 'admin',
              exp: expiresAt,
            }
          },
        },
      }),
      mcp({
        resource: new URL('/mcp', environment.APP_URL).toString(),
        loginPage: '/sign-in',
        consentPage: '/mcp-consent',
        scopes: ['openid', 'profile', 'offline_access', 'mcp:read', 'mcp:write'],
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: 'mcp-2026-07-28' }),
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

  // Better Auth's own removal skips `beforeDelete`, which would leave the player's product data behind.
  const deleteUserAsAdmin = async (actorId: string, targetId: string) => {
    if (actorId === targetId) return 'self' as const
    const [actor] = await database.select({ role: user.role }).from(user).where(eq(user.id, actorId)).limit(1)
    if (actor?.role !== 'admin') return 'forbidden' as const
    const [target] = await database.select({ role: user.role }).from(user).where(eq(user.id, targetId)).limit(1)
    if (!target) return 'missing' as const
    if (target.role === 'admin') return 'admin' as const
    await revokeAppleUser(targetId)
    await options.deleteUserData(targetId)
    await (await auth.$context).internalAdapter.deleteUser(targetId)
    return 'deleted' as const
  }

  // Tokens stay on the server: the admin page names a session by its id.
  const userSessions = async (userId: string): Promise<AdminSession[]> =>
    database
      .select({
        id: sessionTable.id,
        userAgent: sessionTable.userAgent,
        ipAddress: sessionTable.ipAddress,
        createdAt: sessionTable.createdAt,
        updatedAt: sessionTable.updatedAt,
        impersonatedBy: sessionTable.impersonatedBy,
      })
      .from(sessionTable)
      .where(and(eq(sessionTable.userId, userId), gt(sessionTable.expiresAt, new Date())))
      .orderBy(desc(sessionTable.updatedAt))
      .limit(50)

  const revokeUserSession = async (userId: string, sessionId: string) => {
    const [found] = await database
      .select({ token: sessionTable.token })
      .from(sessionTable)
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .limit(1)
    if (!found) return false
    await (await auth.$context).internalAdapter.deleteSession(found.token)
    return true
  }

  const revokeAllUserSessions = async (userId: string) => (await auth.$context).internalAdapter.deleteUserSessions(userId)

  /** A rename goes through the same checks as a player's own; a picture can only be taken away. */
  const moderateProfile = async (userId: string, change: { name: string } | { image: null }) => {
    const checked = await options.updateProfile(change)
    if (!checked.ok) return checked
    const updated = await (await auth.$context).internalAdapter.updateUser(userId, checked.data)
    if (!updated) return { ok: false as const, error: 'The user does not exist.' }
    return { ok: true as const }
  }

  const markEmailVerified = async (userId: string) => {
    const [updated] = await database.update(user).set({ emailVerified: true }).where(eq(user.id, userId)).returning({ id: user.id })
    return Boolean(updated)
  }

  const emailOf = async (userId: string) =>
    (await database.select({ email: user.email }).from(user).where(eq(user.id, userId)).limit(1))[0]?.email

  const sendVerificationEmailTo = async (userId: string) => {
    const email = await emailOf(userId)
    if (!email) return false
    await auth.api.sendVerificationEmail({ body: { email, callbackURL: '/profile?verified=true' } })
    return true
  }

  const sendPasswordResetTo = async (userId: string) => {
    const email = await emailOf(userId)
    if (!email) return false
    await auth.api.requestPasswordReset({ body: { email, redirectTo: '/reset-password' } })
    return true
  }

  const mcpResource = new URL('/mcp', environment.APP_URL).toString()
  const grantedMcpResource = (resources: string | null) => {
    if (!resources) return false
    const parsed: unknown = JSON.parse(resources)
    return Array.isArray(parsed) && parsed.includes(mcpResource)
  }

  const mcpConnectionsFor = async (userId: string): Promise<AdminConnection[]> => {
    const rows = await database
      .select({
        id: oauthConsent.id,
        clientId: oauthConsent.clientId,
        name: oauthClient.name,
        scopes: oauthConsent.scopes,
        resources: oauthConsent.resources,
        createdAt: oauthConsent.createdAt,
      })
      .from(oauthConsent)
      .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
      .where(eq(oauthConsent.userId, userId))
      .orderBy(desc(oauthConsent.createdAt))
      .limit(100)
    return rows
      .filter((row) => grantedMcpResource(row.resources))
      .map(({ id, clientId, name, scopes, createdAt }) => ({
        id,
        clientId,
        name: name || clientId,
        scopes: (JSON.parse(scopes) as unknown[]).filter((scope): scope is string => typeof scope === 'string'),
        createdAt,
      }))
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

  // A signed access token can outlive a revoked grant, so MCP checks the current consent on every call.
  const hasMcpConsent = async (userId: string, clientId: string, scope?: string) => {
    const rows = await database
      .select({ resources: oauthConsent.resources, scopes: oauthConsent.scopes })
      .from(oauthConsent)
      .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)))
    const resource = new URL('/mcp', environment.APP_URL).toString()
    return rows.some(({ resources, scopes }) => {
      if (!resources) return false
      const grantedResources: unknown = JSON.parse(resources)
      const grantedScopes: unknown = JSON.parse(scopes)
      return (
        Array.isArray(grantedResources) &&
        grantedResources.includes(resource) &&
        (!scope || (Array.isArray(grantedScopes) && grantedScopes.includes(scope)))
      )
    })
  }

  // Better Auth's consent deletion does not remove previously issued tokens.
  const revokeMcpConsent = async (userId: string, id: string) => {
    await database.transaction(async (transaction) => {
      const [consent] = await transaction
        .select({ clientId: oauthConsent.clientId })
        .from(oauthConsent)
        .where(and(eq(oauthConsent.id, id), eq(oauthConsent.userId, userId)))
        .limit(1)
      if (!consent) throw new Response('Connection not found.', { status: 404 })
      await transaction
        .delete(oauthRefreshToken)
        .where(and(eq(oauthRefreshToken.userId, userId), eq(oauthRefreshToken.clientId, consent.clientId)))
      await transaction
        .delete(oauthAccessToken)
        .where(and(eq(oauthAccessToken.userId, userId), eq(oauthAccessToken.clientId, consent.clientId)))
      await transaction.delete(oauthConsent).where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, consent.clientId)))
    })
  }

  return Object.assign(auth, {
    changeUserRole,
    deleteUserAsAdmin,
    userSessions,
    revokeUserSession,
    revokeAllUserSessions,
    moderateProfile,
    markEmailVerified,
    sendVerificationEmailTo,
    sendPasswordResetTo,
    mcpConnectionsFor,
    deleteAppleAccount,
    revokeAppleTokens,
    revokeAppleUser,
    hasMcpConsent,
    revokeMcpConsent,
  })
}
