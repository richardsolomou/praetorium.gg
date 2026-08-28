import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createAuthEndpoint, getAuthoritativeSessionFromCtx, sessionMiddleware } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { z } from 'zod'

const EXCHANGE_MINUTES = 3
const exchangeBody = z.object({
  id: z.string().min(32).max(128),
  token: z.string().min(32).max(128),
  verifier: z.string().regex(/^[\w-]{43}$/),
})
const generateBody = z.object({
  action: z.enum(['link', 'sign-in']),
  challenge: z.string().regex(/^[\w-]{43}$/),
  provider: z.enum(['discord', 'google']),
  next: z
    .string()
    .min(1)
    .max(2048)
    .refine((value) => {
      try {
        const origin = new URL('https://praetorium.gg')
        const parsed = new URL(value, origin)
        return value.startsWith('/') && parsed.origin === origin.origin
      } catch {
        return false
      }
    }),
})

const exchangeRecordSchema = generateBody.extend({ sessionToken: z.string().min(1), userId: z.string().min(1) })
type ExchangeRecord = z.infer<typeof exchangeRecordSchema>

function exchangeIdentifier(id: string, token: string) {
  const digest = createHash('sha256').update(token).digest('base64url')
  return `native-auth:${id}:${digest}`
}

function hasChallenge(record: ExchangeRecord, verifier: string) {
  const actual = Buffer.from(createHash('sha256').update(verifier).digest('base64url'))
  const expected = Buffer.from(record.challenge)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function exchangeRecord(value: string) {
  try {
    const parsed = exchangeRecordSchema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function nativeAuthToken() {
  return {
    id: 'praetorium-native-auth-token',
    endpoints: {
      generateNativeAuthToken: createAuthEndpoint(
        '/native-auth-token/generate',
        { method: 'POST', body: generateBody, use: [sessionMiddleware] },
        async (context) => {
          const authenticated = await getAuthoritativeSessionFromCtx(context)
          if (!authenticated) throw context.error('UNAUTHORIZED')
          const accounts = await context.context.internalAdapter.findAccounts(authenticated.user.id)
          if (!accounts.some((account) => account.providerId === context.body.provider)) {
            throw context.error('BAD_REQUEST', { message: 'Provider is not linked' })
          }
          const id = randomBytes(24).toString('base64url')
          const token = randomBytes(32).toString('base64url')
          const value: ExchangeRecord = {
            ...context.body,
            sessionToken: authenticated.session.token,
            userId: authenticated.user.id,
          }
          await context.context.internalAdapter.createVerificationValue({
            identifier: exchangeIdentifier(id, token),
            value: JSON.stringify(value),
            expiresAt: new Date(Date.now() + EXCHANGE_MINUTES * 60 * 1000),
          })
          return context.json({ id, token })
        },
      ),
      exchangeNativeAuthToken: createAuthEndpoint(
        '/native-auth-token/exchange',
        { method: 'POST', body: exchangeBody },
        async (context) => {
          const exchange = await context.context.internalAdapter.findVerificationValue(
            exchangeIdentifier(context.body.id, context.body.token),
          )
          if (!exchange || exchange.expiresAt <= new Date()) throw context.error('BAD_REQUEST', { message: 'Invalid token' })
          const record = exchangeRecord(exchange.value)
          if (!record || !hasChallenge(record, context.body.verifier)) throw context.error('BAD_REQUEST', { message: 'Invalid token' })
          const session = await context.context.internalAdapter.findSession(record.sessionToken)
          if (!session || session.session.userId !== record.userId || session.session.expiresAt <= new Date()) {
            throw context.error('BAD_REQUEST', { message: 'Session not found' })
          }
          const accounts = await context.context.internalAdapter.findAccounts(record.userId)
          if (!accounts.some((account) => account.providerId === record.provider)) {
            throw context.error('BAD_REQUEST', { message: 'Provider is not linked' })
          }
          await setSessionCookie(context, session)
          return context.json({ id: context.body.id, action: record.action, provider: record.provider, next: record.next })
        },
      ),
      consumeNativeAuthToken: createAuthEndpoint('/native-auth-token/consume', { method: 'POST', body: exchangeBody }, async (context) => {
        const identifier = exchangeIdentifier(context.body.id, context.body.token)
        const exchange = await context.context.internalAdapter.findVerificationValue(identifier)
        if (!exchange || exchange.expiresAt <= new Date()) throw context.error('BAD_REQUEST', { message: 'Invalid token' })
        const record = exchangeRecord(exchange.value)
        if (!record || !hasChallenge(record, context.body.verifier)) throw context.error('BAD_REQUEST', { message: 'Invalid token' })
        await context.context.internalAdapter.consumeVerificationValue(identifier)
        return context.json({ ok: true })
      }),
    },
  }
}
