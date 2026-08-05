import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { PraetoriumDatabase } from '../db/connection'
import { schema } from '../db/schema'

export const SOCIAL_PROVIDERS = ['google', 'discord'] as const
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number]

export const PASSWORD_MIN_LENGTH = 10

/**
 * Kept beside the database so an operator needs no configuration, and so sessions
 * survive a redeploy. The environment wins when someone would rather manage it.
 */
export function authSecret(dataDirectory: string) {
  const configured = process.env.AUTH_SECRET?.trim()
  if (configured) return configured
  const file = path.join(dataDirectory, 'auth.secret')
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim()
  const secret = crypto.randomBytes(32).toString('base64url')
  fs.writeFileSync(file, secret, { mode: 0o600 })
  return secret
}

/** A provider is offered only when both halves of its credential are present. */
export function configuredProviders(env: NodeJS.ProcessEnv = process.env): SocialProvider[] {
  return SOCIAL_PROVIDERS.filter((provider) => {
    const prefix = provider.toUpperCase()
    return Boolean(env[`${prefix}_CLIENT_ID`]?.trim() && env[`${prefix}_CLIENT_SECRET`]?.trim())
  })
}

function socialProviders(env: NodeJS.ProcessEnv) {
  const credentials = (provider: SocialProvider) => ({
    clientId: env[`${provider.toUpperCase()}_CLIENT_ID`] ?? '',
    clientSecret: env[`${provider.toUpperCase()}_CLIENT_SECRET`] ?? '',
  })
  const enabled = configuredProviders(env)
  return {
    ...(enabled.includes('google') ? { google: credentials('google') } : {}),
    ...(enabled.includes('discord') ? { discord: credentials('discord') } : {}),
  }
}

export function createAuth(database: PraetoriumDatabase, secret: string) {
  return betterAuth({
    database: drizzleAdapter(database, { provider: 'sqlite', schema }),
    secret,
    baseURL: process.env.APP_URL?.trim() || undefined,
    // An account exists to keep a player's lists, not to gate play: nothing here
    // needs an inbox, and there is no verification step to stall a first game.
    emailAndPassword: { enabled: true, minPasswordLength: PASSWORD_MIN_LENGTH, autoSignIn: true, requireEmailVerification: false },
    socialProviders: socialProviders(process.env),
    // Signing in with Google to an account made with a password should land on the
    // same account, not a second one.
    account: { accountLinking: { enabled: true, trustedProviders: [...SOCIAL_PROVIDERS] } },
    /*
     * Limits are per IP, and two people at the same table share one: a pair signing
     * up in the same room must not lock each other out. Generous enough for that,
     * tight enough to make guessing a password pointless.
     */
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 120,
      customRules: { '/sign-in/email': { window: 60, max: 20 }, '/sign-up/email': { window: 60, max: 15 } },
    },
    session: { expiresIn: 60 * 60 * 24 * 90, updateAge: 60 * 60 * 24 },
    advanced: { useSecureCookies: (process.env.APP_URL ?? '').startsWith('https://') },
    trustedOrigins: (request) => {
      const forwarded = request ? forwardedOrigin(request) : undefined
      return forwarded ? [forwarded] : []
    },
  })
}

function forwardedOrigin(request: Request) {
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.headers.get('host')?.trim()
  const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  if (!host || (protocol !== 'http' && protocol !== 'https')) return undefined
  try {
    return new URL(`${protocol}://${host}`).origin
  } catch {
    return undefined
  }
}
