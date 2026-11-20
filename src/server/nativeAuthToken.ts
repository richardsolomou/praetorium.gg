import { hash } from 'node:crypto'
import { constantTimeEqual } from 'better-auth/crypto'
import type { AuthContext, GenericEndpointContext } from 'better-auth'
import { createAuthEndpoint, createAuthMiddleware, getSessionFromCtx, isAPIError } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto'
import { generateIdTokenNonce, getOAuthCallbackPath, handleOAuthUserInfo, linkOAuthAccount } from 'better-auth/oauth2'
import { isSameOriginRequest } from './origins'
import { randomToken } from './random'
import { z } from 'zod'
import { SOCIAL_PROVIDERS } from '../authConfig'
import { NATIVE_AUTH_ERROR_QUERY, NATIVE_AUTH_SUCCESS_QUERY, PKCE_VALUE } from '../contracts/nativeAuth'

const EXCHANGE_MINUTES = 3
const NULL_ORIGIN_ENDPOINTS = new Set(['/native-auth-token/exchange', '/native-auth-token/consume'])
// Each of these signs its caller in or links a sign-in to them from a token alone, so no other site may post one.
const SAME_ORIGIN_ENDPOINTS = new Set([...NULL_ORIGIN_ENDPOINTS, '/one-time-token/verify'])
const PROVIDER_MINUTES = 10
const exchangeBody = z.object({
  id: z.string().min(32).max(128),
  token: z.string().min(32).max(128),
  verifier: z.string().regex(PKCE_VALUE),
  navigation: z.literal('1').optional(),
})
const asked = z.object({
  action: z.enum(['link', 'sign-in']),
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

const startBody = asked.extend({ bridge: z.union([z.literal(2), z.literal(3)]), requestSignUp: z.boolean().optional() })

/**
 * What the browser the shell opened leaves for that shell, and never keeps itself: anyone can send an address that
 * opens that browser, so it is never signed in and links nothing. Only the shell that asked holds the verifier.
 */
const exchangeRecordSchema = z.union([
  /** A session the provider's sign-in created, for the shell's WebView to take. */
  asked.extend({ action: z.literal('sign-in'), sessionToken: z.string().min(1), userId: z.string().min(1) }),
  /** Proof of who signed in to the provider, for the shell, signed in itself, to link to its own account. */
  asked.extend({ action: z.literal('link'), proof: z.string().min(1) }),
])
type ExchangeRecord = z.infer<typeof exchangeRecordSchema>

const startedSchema = startBody.extend({ codeVerifier: z.string(), idTokenNonce: z.string().optional() })
type Started = z.infer<typeof startedSchema>
const startedIdentifier = (state: string) => `native-auth-state:${state}`
const proofSchema = z.object({
  account: z.record(z.string(), z.unknown()),
  userInfo: z.record(z.string(), z.unknown()),
  profile: z.record(z.string(), z.unknown()),
  scopes: z.array(z.string()).optional(),
})

/** Where the browser returns to the page that hands the shell its answer; the answer rides in the fragment, which no server logs. */
function pageReturn(baseURL: string, started: Started, answer: { id: string; token: string } | { error: string }) {
  const page = new URL('/native-auth', baseURL)
  page.search = new URLSearchParams({
    action: started.action,
    bridge: String(started.bridge),
    challenge: started.challenge,
    complete: 'true',
    next: started.next,
    provider: started.provider,
    ...('error' in answer ? { error: answer.error } : {}),
  }).toString()
  if ('id' in answer) page.hash = new URLSearchParams(answer).toString()
  return page.toString()
}

type Options = {
  /** Called once a provider sign-in the shell asked for has a session, since no later hook sees one made here. */
  signedIn?: (context: GenericEndpointContext, userId: string) => Promise<void>
}

/**
 * The provider's answer to what the shell started, or null for a callback the shell did not start. A sign-in gets its
 * session and a link its proof, each stored for the shell to collect; this browser is given neither.
 */
async function answerShell(context: GenericEndpointContext, state: string, options: Options) {
  const stored = await context.context.internalAdapter.consumeVerificationValue(startedIdentifier(state))
  const started = stored && stored.expiresAt > new Date() ? startedSchema.safeParse(JSON.parse(stored.value)).data : undefined
  if (!started) return null
  const back = (answer: Parameters<typeof pageReturn>[2]) => pageReturn(context.context.baseURL, started, answer)
  const query = z
    .object({ code: z.string().optional(), device_id: z.string().optional(), user: z.string().optional() })
    .parse(context.query)
  const provider = context.context.socialProviders.find((candidate) => candidate.id === started.provider)
  if (!provider || !query.code) return back({ error: 'provider_refused' })
  try {
    const tokens = await provider.validateAuthorizationCode({
      code: query.code,
      codeVerifier: started.codeVerifier,
      deviceId: query.device_id,
      redirectURI: `${context.context.baseURL}${getOAuthCallbackPath(provider)}`,
    })
    const user = z
      .string()
      .transform((value) => JSON.parse(value) as unknown)
      .safeParse(query.user).data
    const result = tokens && (await provider.getUserInfo({ ...tokens, expectedIdTokenNonce: started.idTokenNonce, user } as never))
    if (!tokens || !result?.user) return back({ error: 'provider_refused' })
    const accountId = String(await provider.accountSubject({ tokens, profile: result.data })).trim()
    // Better Auth's own callback refuses a subject that is no identity at all.
    if (!accountId || accountId === 'undefined' || accountId === 'null') return back({ error: 'provider_refused' })
    const account = { providerId: provider.id, accountId, ...tokens, scope: tokens.scopes?.join(',') }
    const { action: _action, bridge: _bridge, codeVerifier: _codeVerifier, idTokenNonce: _nonce, requestSignUp, ...shell } = started
    let record: ExchangeRecord
    if (started.action === 'link') {
      const proof: z.input<typeof proofSchema> = { account, userInfo: result.user, profile: { ...result.data }, scopes: tokens.scopes }
      // The provider's tokens rest here until the shell collects them.
      record = { ...shell, action: 'link', proof: await symmetricEncrypt({ key: context.context.secret, data: JSON.stringify(proof) }) }
    } else {
      if (!result.user.email) return back({ error: 'email_not_found' })
      const signedIn = await handleOAuthUserInfo(context, {
        userInfo: { ...result.user, id: accountId, email: result.user.email, name: result.user.name || '' },
        account,
        callbackURL: started.next,
        disableSignUp: (provider.disableImplicitSignUp && !requestSignUp) || provider.options?.disableSignUp,
        overrideUserInfo: provider.options?.overrideUserInfoOnSignIn,
        source: { method: 'oauth', oauth: { providerId: provider.id, profile: { ...result.data } } },
      })
      if (signedIn.error || !signedIn.data) return back({ error: (signedIn.error ?? 'provider_refused').split(' ').join('_') })
      record = { ...shell, action: 'sign-in', sessionToken: signedIn.data.session.token, userId: signedIn.data.user.id }
      await options.signedIn?.(context, signedIn.data.user.id)
    }
    const id = randomToken(24)
    const token = randomToken(32)
    await context.context.internalAdapter.createVerificationValue({
      identifier: exchangeIdentifier(id, token),
      value: JSON.stringify(record),
      expiresAt: new Date(Date.now() + EXCHANGE_MINUTES * 60 * 1000),
    })
    return back({ id, token })
  } catch (error) {
    if (isAPIError(error) && typeof error.body?.code === 'string') return back({ error: error.body.code })
    context.context.logger.error('Native provider answer failed', error)
    return back({ error: 'provider_refused' })
  }
}

/** Links the proven identity to whoever the shell is signed in as, by the rules a link started on the site follows. */
async function linkProof(context: GenericEndpointContext, record: Extract<ExchangeRecord, { action: 'link' }>) {
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

export function nativeAuthToken(options: Options = {}) {
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
            const answer = typeof state === 'string' ? await answerShell(context, state, options) : null
            if (answer) throw context.redirect(answer)
          }),
        },
      ],
    },
    endpoints: {
      startNativeAuth: createAuthEndpoint('/native-auth-token/start', { method: 'POST', body: startBody }, async (context) => {
        const provider = context.context.socialProviders.find((candidate) => candidate.id === context.body.provider)
        if (!provider) throw context.error('BAD_REQUEST', { message: 'Provider is not available' })
        const state = randomToken(32)
        const codeVerifier = randomToken(64)
        const idTokenNonce = generateIdTokenNonce(provider)
        await context.context.internalAdapter.createVerificationValue({
          identifier: startedIdentifier(state),
          value: JSON.stringify({ ...context.body, codeVerifier, idTokenNonce } satisfies Started),
          expiresAt: new Date(Date.now() + PROVIDER_MINUTES * 60 * 1000),
        })
        const url = await provider.createAuthorizationURL({
          state,
          codeVerifier,
          idTokenNonce,
          redirectURI: `${context.context.baseURL}${getOAuthCallbackPath(provider)}`,
        })
        return context.json({ url: url.toString() })
      }),
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
          if (record.action === 'link') {
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
