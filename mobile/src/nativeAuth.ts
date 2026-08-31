import { APP_URL } from './navigation'

export const NATIVE_AUTH_CALLBACK_URL = 'praetorium://auth'

const PROVIDERS = new Set(['apple', 'discord', 'google'])
const ACTIONS = new Set(['link', 'sign-in'])

export type NativeAuthRequest = {
  action: 'link' | 'sign-in'
  provider: 'apple' | 'discord' | 'google'
  next: string
  requestSignUp: boolean
  sessionToken?: string
  challenge: string
  verifier: string
}

export type NativeAuthProof = Pick<NativeAuthRequest, 'challenge' | 'verifier'>

export type NativeAuthCallback =
  | {
      kind: 'success'
      action: NativeAuthRequest['action']
      provider: NativeAuthRequest['provider']
      next: string
      challenge: string
      id: string
      token: string
      verifier: string
    }
  | { kind: 'error' }

function localPath(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null
  try {
    const parsed = new URL(value, APP_URL)
    if (parsed.origin !== APP_URL) return null
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return null
  }
}

export function parseNativeAuthRequest(message: string): NativeAuthRequest | null {
  try {
    const value = JSON.parse(message) as Record<string, unknown>
    const next = localPath(value.next)
    if (
      (value.version !== 2 && value.version !== 3) ||
      value.type !== 'native-auth' ||
      !ACTIONS.has(String(value.action)) ||
      !PROVIDERS.has(String(value.provider)) ||
      !next
    ) {
      return null
    }
    if (typeof value.challenge !== 'string' || !/^[\w-]{43}$/.test(value.challenge)) return null
    if (typeof value.verifier !== 'string' || !/^[\w-]{43}$/.test(value.verifier)) return null
    if (value.sessionToken !== undefined && (typeof value.sessionToken !== 'string' || value.sessionToken.length < 16)) return null
    if (value.action === 'link' && !value.sessionToken) return null
    return {
      action: value.action as NativeAuthRequest['action'],
      provider: value.provider as NativeAuthRequest['provider'],
      next,
      challenge: value.challenge,
      verifier: value.verifier,
      requestSignUp: value.requestSignUp === true,
      ...(typeof value.sessionToken === 'string' ? { sessionToken: value.sessionToken } : {}),
    }
  } catch {
    return null
  }
}

export function nativeAuthStartUrl(request: NativeAuthRequest) {
  const url = new URL('/native-auth', APP_URL)
  url.searchParams.set('provider', request.provider)
  url.searchParams.set('action', request.action)
  url.searchParams.set('next', request.next)
  url.searchParams.set('bridge', '3')
  url.searchParams.set('challenge', request.challenge)
  if (request.requestSignUp) url.searchParams.set('requestSignUp', 'true')
  if (request.sessionToken) url.hash = new URLSearchParams({ session: request.sessionToken }).toString()
  return url.toString()
}

export function parseNativeAuthCallback(value: string, proof?: NativeAuthProof): NativeAuthCallback {
  try {
    const url = new URL(value)
    const next = localPath(url.searchParams.get('next'))
    const action = url.searchParams.get('action')
    const provider = url.searchParams.get('provider')
    const challenge = url.searchParams.get('challenge')
    const id = url.searchParams.get('id')
    const token = url.searchParams.get('token')
    if (
      url.protocol !== 'praetorium:' ||
      url.hostname !== 'auth' ||
      (url.searchParams.get('version') !== '2' && url.searchParams.get('version') !== '3') ||
      url.searchParams.has('error') ||
      !next ||
      !ACTIONS.has(String(action)) ||
      !PROVIDERS.has(String(provider)) ||
      !id ||
      id.length < 32 ||
      !token ||
      token.length < 16 ||
      !proof ||
      challenge !== proof.challenge
    ) {
      return { kind: 'error' }
    }
    return {
      kind: 'success',
      action: action as NativeAuthRequest['action'],
      challenge,
      id,
      provider: provider as NativeAuthRequest['provider'],
      next,
      token,
      verifier: proof.verifier,
    }
  } catch {
    return { kind: 'error' }
  }
}

export function nativeAuthExchangeScript(callback: Extract<NativeAuthCallback, { kind: 'success' }>) {
  const payload = JSON.stringify(callback)
  return `void (async () => {
    const auth = ${payload};
    try {
      const response = await fetch('/api/auth/native-auth-token/exchange', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: auth.id, token: auth.token, verifier: auth.verifier }),
      });
      if (response.status === 400) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ version: 2, type: 'native-auth-result', id: auth.id, ok: false, retryable: false }));
        return;
      }
      if (!response.ok) throw new Error('native auth exchange failed');
      const exchange = await response.json();
      if (exchange.id !== auth.id || typeof exchange.next !== 'string') throw new Error('native auth exchange mismatch');
      window.ReactNativeWebView.postMessage(JSON.stringify({ version: 2, type: 'native-auth-result', id: exchange.id, ok: true }));
      window.location.replace(exchange.next);
    } catch {
      window.ReactNativeWebView.postMessage(JSON.stringify({ version: 2, type: 'native-auth-result', id: auth.id, ok: false, retryable: true }));
    }
  })(); true;`
}

export function nativeAuthConsumeScript(callback: Extract<NativeAuthCallback, { kind: 'success' }>) {
  const payload = JSON.stringify({ id: callback.id, token: callback.token, verifier: callback.verifier })
  return `void fetch('/api/auth/native-auth-token/consume', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(${payload}),
  }); true;`
}
