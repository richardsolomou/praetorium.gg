import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, type JWTVerifyGetKey, type KeyInput } from 'jose'
import { z } from 'zod'

export const APPLE_AUTH_ORIGIN = 'https://appleid.apple.com'
const APPLE_ISSUER = APPLE_AUTH_ORIGIN
const APPLE_REVOKE_URL = `${APPLE_ISSUER}/auth/revoke`
const APPLE_JWKS = createRemoteJWKSet(new URL(`${APPLE_ISSUER}/auth/keys`))
const IOS_BUNDLE_ID = 'gg.praetorium'
const NOTIFICATION_BODY_LIMIT = 32 * 1024

type AppleEnvironment = Partial<
  Record<'APPLE_CLIENT_ID' | 'APPLE_CLIENT_SECRET' | 'APPLE_TEAM_ID' | 'APPLE_KEY_ID' | 'APPLE_PRIVATE_KEY', string>
>

export type AppleCredentials = {
  clientId: string
  clientSecret: () => Promise<string>
}

export async function generateAppleClientSecret(clientId: string, teamId: string, keyId: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000)
  const key = await importPKCS8(privateKey.replaceAll('\\n', '\n').trim(), 'ES256')
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + 180 * 24 * 60 * 60)
    .sign(key)
}

export function appleCredentials(environment: AppleEnvironment = process.env): AppleCredentials | undefined {
  const clientId = environment.APPLE_CLIENT_ID?.trim()
  const staticSecret = environment.APPLE_CLIENT_SECRET?.trim()
  const teamId = environment.APPLE_TEAM_ID?.trim()
  const keyId = environment.APPLE_KEY_ID?.trim()
  const privateKey = environment.APPLE_PRIVATE_KEY?.trim()
  const hasSigningKey = Boolean(keyId || privateKey)
  const completeSigningKey = Boolean(clientId && teamId && keyId && privateKey)

  if (staticSecret && completeSigningKey) {
    throw new Error('Configure either APPLE_CLIENT_SECRET or APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY, not both')
  }
  if (clientId && staticSecret) return { clientId, clientSecret: async () => staticSecret }
  if (completeSigningKey) {
    return {
      clientId: clientId!,
      clientSecret: () => generateAppleClientSecret(clientId!, teamId!, keyId!, privateKey!),
    }
  }
  if (clientId || staticSecret || hasSigningKey) {
    throw new Error(
      'Apple sign-in credentials require APPLE_CLIENT_ID with APPLE_CLIENT_SECRET or with APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY',
    )
  }
  return undefined
}

export async function revokeAppleToken(
  credentials: AppleCredentials,
  token: { token: string; type: 'access_token' | 'refresh_token' },
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher(APPLE_REVOKE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: await credentials.clientSecret(),
      token: token.token,
      token_type_hint: token.type,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Apple token revocation failed with HTTP ${response.status}`)
}

export function appleNotificationAudiences(environment: AppleEnvironment = process.env) {
  return [...new Set([IOS_BUNDLE_ID, environment.APPLE_CLIENT_ID?.trim()].filter((value): value is string => Boolean(value)))]
}

const notificationBodySchema = z.object({ payload: z.string().min(1).max(NOTIFICATION_BODY_LIMIT) })
const notificationClaimsSchema = z.object({
  jti: z.string().min(1),
  events: z.object({
    type: z.enum(['email-disabled', 'email-enabled', 'consent-revoked', 'account-deleted']),
    sub: z.string().min(1),
    event_time: z.number().int(),
  }),
})

async function boundedBody(request: Request) {
  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (declaredLength > NOTIFICATION_BODY_LIMIT) return null
  if (!request.body) return ''
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let body = ''
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) return body + decoder.decode()
    size += value.byteLength
    if (size > NOTIFICATION_BODY_LIMIT) {
      await reader.cancel()
      return null
    }
    body += decoder.decode(value, { stream: true })
  }
}

export async function appleNotificationResponse(
  request: Request,
  deleteAccount: (appleSubject: string) => Promise<void>,
  audiences = appleNotificationAudiences(),
  verificationKey: KeyInput | JWTVerifyGetKey = APPLE_JWKS,
) {
  let event: z.infer<typeof notificationClaimsSchema>['events']
  try {
    const rawBody = await boundedBody(request)
    if (rawBody === null) return new Response('Payload too large', { status: 413 })
    const body = notificationBodySchema.parse(JSON.parse(rawBody))
    const verified = await jwtVerify(body.payload, verificationKey, {
      algorithms: ['RS256'],
      issuer: APPLE_ISSUER,
      audience: audiences,
    })
    event = notificationClaimsSchema.parse(verified.payload).events
  } catch {
    return new Response('Invalid Apple notification', { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  if (event.type === 'consent-revoked' || event.type === 'account-deleted') await deleteAccount(event.sub)
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
