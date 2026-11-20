import { hash } from 'node:crypto'
import { constantTimeEqual } from 'better-auth/crypto'
import type { AuthContext, GenericEndpointContext } from 'better-auth'
import {
  createAuthEndpoint,
  createAuthMiddleware,
  getAuthoritativeSessionFromCtx,
  getSessionFromCtx,
  sessionMiddleware,
} from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto'
import { generateIdTokenNonce, getOAuthCallbackPath, linkOAuthAccount } from 'better-auth/oauth2'
import { isSameOriginRequest } from './origins'
import { randomToken } from './random'
import { z } from 'zod'
import { SOCIAL_PROVIDERS } from '../authConfig'
import { NATIVE_AUTH_ERROR_QUERY, NATIVE_AUTH_SUCCESS_QUERY, PKCE_VALUE } from '../contracts/nativeAuth'

const EXCHANGE_MINUTES = 3
const NULL_ORIGIN_ENDPOINTS = new Set(['/native-auth-token/exchange', '/native-auth-token/consume'])
// Each of these signs its caller in or links a sign-in to them from a token alone, so no other site may post one.
const SAME_ORIGIN_ENDPOINTS = new Set([...NULL_ORIGIN_ENDPOINTS, '/one-time-token/verify'])
const LINK_MINUTES = 10
const exchangeBody = z.object({
  id: z.string().min(32).max(128),
  token: z.string().min(32).max(128),
  verifier: z.string().regex(PKCE_VALUE),
  navigation: z.literal('1').optional(),
})
const generateBody = z.object({
  action: z.literal('sign-in'),
  challenge: z.string().regex(PKCE_VALUE),
  provider: z.enum(SOCIAL_PROVIDERS),
  next: z
    .string()
    .min(1)
    .max(2048)
    .refine((value) => {
      try {
        const origin = new URL('https://praetorium.gg')
        const parsed = new URL(value, origin)
        return (
          value.startsWith('/') &&
          parsed.origin === origin.origin &&
          !parsed.searchParams.has(NATIVE_AUTH_SUCCESS_QUERY) &&
          !parsed.searchParams.has(NATIVE_AUTH_ERROR_QUERY)
        )
      } catch {
        return false
      }
    }),
})

const linkBody = generateBody.extend({ action: z.literal('link'), bridge: z.union([z.literal(2), z.literal(3)]) })

/** A browser's session, handed to the shell that asked for it. */
const sessionRecord = generateBody.extend({ sessionToken: z.string().min(1), userId: z.string().min(1) })
/**
 * Proof that a browser signed in to a provider, with nothing linked yet. The browser holds no Praetorium session, so
 * a link somebody else sent it attaches nothing; only the shell that asked, signed in itself, turns the proof into a link.
 */
const proofRecord = linkBody.omit({ bridge: true }).extend({ proof: z.string().min(1) })
const exchangeRecordSchema = z.union([sessionRecord, proofRecord])
type ExchangeRecord = z.infer<typeof exchangeRecordSchema>

const linkStateSchema = linkBody.extend({ codeVerifier: z.string(), idTokenNonce: z.string().optional() })
const linkStateIdentifier = (state: string) => `native-link:${state}`
const proofSchema = z.object({
  account: z.record(z.string(), z.unknown()),
  userInfo: z.record(z.string(), z.unknown()),
  profile: z.record(z.string(), z.unknown()),
  scopes: z.array(z.string()).optional(),
})

/** Where the browser returns to the page that hands the shell its answer; a proof rides in the fragment, which no server logs. */
function linkReturn(baseURL: string, link: z.infer<typeof linkBody>, answer: { id: string; token: string } | { error: string }) {
  const page = new URL('/native-auth', baseURL)
  page.search = new URLSearchParams({
    action: 'link',
    bridge: String(link.bridge),
    challenge: link.challenge,
    complete: 'true',
    next: link.next,
    provider: link.provider,
    ...('error' in answer ? { error: answer.error } : {}),
  }).toString()
  if ('id' in answer) page.hash = new URLSearchParams(answer).toString()
  return page.toString()
}

/** The provider's answer to a link the shell started: its identity is proven and kept for the shell, never linked here. */
async function proveLink(context: GenericEndpointContext, state: string) {
  const stored = await context.context.internalAdapter.consumeVerificationValue(linkStateIdentifier(state))
  const link = stored && stored.expiresAt > new Date() ? linkStateSchema.safeParse(JSON.parse(stored.value)).data : undefined
  if (!link) return null
  const back = (answer: Parameters<typeof linkReturn>[2]) => linkReturn(context.context.baseURL, link, answer)
  const query = z
    .object({ code: z.string().optional(), device_id: z.string().optional(), user: z.string().optional() })
    .parse(context.query)
  const provider = context.context.socialProviders.find((candidate) => candidate.id === link.provider)
  if (!provider || !query.code) return back({ error: 'provider_refused' })
  try {
    const tokens = await provider.validateAuthorizationCode({
      code: query.code,
      codeVerifier: link.codeVerifier,
      deviceId: query.device_id,
      redirectURI: `${context.context.baseURL}${getOAuthCallbackPath(provider)}`,
    })
    const user: unknown = query.user ? JSON.parse(query.user) : undefined
    const result = tokens && (await provider.getUserInfo({ ...tokens, expectedIdTokenNonce: link.idTokenNonce, user } as never))
    if (!tokens || !result?.user) return back({ error: 'provider_refused' })
    const accountId = String(await provider.accountSubject({ tokens, profile: result.data }))
    const proof: z.input<typeof proofSchema> = {
      account: { providerId: provider.id, accountId, ...tokens, scope: tokens.scopes?.join(',') },
      userInfo: result.user,
      profile: { ...result.data },
      scopes: tokens.scopes,
    }
    const id = randomToken(24)
    const token = randomToken(32)
    const { bridge: _bridge, codeVerifier: _codeVerifier, idTokenNonce: _idTokenNonce, ...asked } = link
    const value: ExchangeRecord = {
      ...asked,
      // The provider's tokens rest here until the shell collects them.
      proof: await symmetricEncrypt({ key: context.context.secret, data: JSON.stringify(proof) }),
    }
    await context.context.internalAdapter.createVerificationValue({
      identifier: exchangeIdentifier(id, token),
      value: JSON.stringify(value),
      expiresAt: new Date(Date.now() + EXCHANGE_MINUTES * 60 * 1000),
    })
    return back({ id, token })
  } catch (error) {
    context.context.logger.error('Native link proof failed', error)
    return back({ error: 'provider_refused' })
  }
}

/** Links the proven identity to whoever the shell is signed in as, by the rules a link started on the site follows. */
async function linkProof(context: GenericEndpointContext, record: z.infer<typeof proofRecord>) {
  const session = await getSessionFromCtx(context)
  if (!session) return 'Sign in before linking a provider'
  const proof = proofSchema.parse(JSON.parse(await symmetricDecrypt({ key: context.context.secret, data: record.proof })))
  const account = Object.fromEntries(
    Object.entries(proof.account).map(([key, value]) => [
      key,
      key.endsWith('ExpiresAt') && typeof value === 'string' ? new Date(value) : value,
    ]),
  )
  const linked = await linkOAuthAccount(context, {
    link: { userId: session.user.id, email: session.user.email },
    userInfo: proof.userInfo,
    account,
    profile: proof.profile,
    scopes: proof.scopes,
  } as never)
  return linked.linked ? null : linked.error.message || linked.error.code
}

function exchangeIdentifier(id: string, token: string) {
  const digest = hash('sha256', token, 'base64url')
  return `native-auth:${id}:${digest}`
}

const hasChallenge = (record: ExchangeRecord, verifier: string) =>
  constantTimeEqual(hash('sha256', verifier, 'base64url'), record.challenge)

function exchangeRecord(value: string) {
  try {
    const parsed = exchangeRecordSchema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * The request an exchange or its consumption is answered from, or the refusal of one another site sent. A WebView posts
 * the form without an origin, which is filled in here; a browser still says when a form came from somewhere else, and
 * such a form would sign its visitor in to whichever account the sender holds a proof for.
 */
export function nativeAuthProofRequest(request: Request, baseURL: string) {
  if (request.method !== 'POST') return request
  const base = new URL(baseURL)
  const basePath = base.pathname.replace(/\/+$/, '')
  const pathname = new URL(request.url).pathname.replace(/\/+$/, '')
  const endpoint = pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : pathname
  if (!SAME_ORIGIN_ENDPOINTS.has(endpoint)) return request
  const origin = request.headers.get('origin')
  const site = request.headers.get('sec-fetch-site')
  const named = origin && origin !== 'null'
  if (named ? !isSameOriginRequest(request) : site && site !== 'same-origin')
    return new Response('cross-site request rejected', { status: 403 })
  if (named || !NULL_ORIGIN_ENDPOINTS.has(endpoint)) return request
  const headers = new Headers(request.headers)
  headers.set('origin', base.origin)
  const init = { method: request.method, headers, body: request.body, duplex: 'half' as const, signal: request.signal }
  return new Request(request.url, init)
}

export function nativeAuthToken() {
  return {
    id: 'praetorium-native-auth-token',
    onRequest: async (request: Request, context: AuthContext) => {
      const normalized = nativeAuthProofRequest(request, context.baseURL)
      if (normalized instanceof Response) return { response: normalized }
      if (normalized !== request) return { request: normalized }
    },
    hooks: {
      before: [
        {
          matcher: (context: { path?: string; method?: string }) =>
            Boolean(context.path?.startsWith('/callback/')) && context.method === 'GET',
          handler: createAuthMiddleware(async (context) => {
            const state: unknown = context.query?.state
            const answer = typeof state === 'string' ? await proveLink(context, state) : null
            if (answer) throw context.redirect(answer)
          }),
        },
      ],
    },
    endpoints: {
      startNativeLink: createAuthEndpoint('/native-auth-token/link', { method: 'POST', body: linkBody }, async (context) => {
        const provider = context.context.socialProviders.find((candidate) => candidate.id === context.body.provider)
        if (!provider) throw context.error('BAD_REQUEST', { message: 'Provider is not available' })
        const state = randomToken(32)
        const codeVerifier = randomToken(64)
        const idTokenNonce = generateIdTokenNonce(provider)
        await context.context.internalAdapter.createVerificationValue({
          identifier: linkStateIdentifier(state),
          value: JSON.stringify({ ...context.body, codeVerifier, idTokenNonce } satisfies z.infer<typeof linkStateSchema>),
          expiresAt: new Date(Date.now() + LINK_MINUTES * 60 * 1000),
        })
        const url = await provider.createAuthorizationURL({
          state,
          codeVerifier,
          idTokenNonce,
          redirectURI: `${context.context.baseURL}${getOAuthCallbackPath(provider)}`,
        })
        return context.json({ url: url.toString() })
      }),
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
          const id = randomToken(24)
          const token = randomToken(32)
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
        {
          method: 'POST',
          body: exchangeBody,
          metadata: { allowedMediaTypes: ['application/json', 'application/x-www-form-urlencoded'] },
        },
        async (context) => {
          const terminal = (message: string) => {
            if (context.body.navigation !== '1') return context.error('BAD_REQUEST', { message })
            const destination = new URL('/sign-in', context.context.baseURL || 'https://praetorium.gg')
            destination.searchParams.set(NATIVE_AUTH_ERROR_QUERY, context.body.id)
            context.setHeader('cache-control', 'no-store')
            return context.redirect(destination.toString())
          }
          const exchange = await context.context.internalAdapter.findVerificationValue(
            exchangeIdentifier(context.body.id, context.body.token),
          )
          if (!exchange || exchange.expiresAt <= new Date()) throw terminal('Invalid token')
          const record = exchangeRecord(exchange.value)
          if (!record || !hasChallenge(record, context.body.verifier)) throw terminal('Invalid token')
          if ('proof' in record) {
            const refusal = await linkProof(context, record)
            if (refusal) throw terminal(refusal)
          } else {
            const session = await context.context.internalAdapter.findSession(record.sessionToken)
            if (!session || session.session.userId !== record.userId || session.session.expiresAt <= new Date()) {
              throw terminal('Session not found')
            }
            const accounts = await context.context.internalAdapter.findAccounts(record.userId)
            if (!accounts.some((account) => account.providerId === record.provider)) {
              throw terminal('Provider is not linked')
            }
            await setSessionCookie(context, session)
          }
          if (context.body.navigation !== '1') {
            return context.json({ id: context.body.id, action: record.action, provider: record.provider, next: record.next })
          }
          const destination = new URL(record.next, context.context.baseURL || 'https://praetorium.gg')
          destination.searchParams.set(NATIVE_AUTH_SUCCESS_QUERY, context.body.id)
          context.setHeader('cache-control', 'no-store')
          throw context.redirect(destination.toString())
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
