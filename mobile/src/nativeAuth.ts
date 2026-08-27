import { APP_URL } from './navigation'

export const NATIVE_AUTH_CALLBACK_URL = 'praetorium://auth'

const PROVIDERS = new Set(['discord', 'google'])
const ACTIONS = new Set(['link', 'sign-in'])

export type NativeAuthRequest = {
  action: 'link' | 'sign-in'
  provider: 'discord' | 'google'
  next: string
  requestSignUp: boolean
  sessionToken?: string
}

export type NativeAuthCallback =
  | { kind: 'success'; action: NativeAuthRequest['action']; provider: NativeAuthRequest['provider']; next: string; token: string }
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
      value.version !== 1 ||
      value.type !== 'native-auth' ||
      !ACTIONS.has(String(value.action)) ||
      !PROVIDERS.has(String(value.provider)) ||
      !next
    ) {
      return null
    }
    if (value.sessionToken !== undefined && (typeof value.sessionToken !== 'string' || value.sessionToken.length < 16)) return null
    if (value.action === 'link' && !value.sessionToken) return null
    return {
      action: value.action as NativeAuthRequest['action'],
      provider: value.provider as NativeAuthRequest['provider'],
      next,
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
  if (request.requestSignUp) url.searchParams.set('requestSignUp', 'true')
  if (request.sessionToken) url.hash = new URLSearchParams({ session: request.sessionToken }).toString()
  return url.toString()
}

export function parseNativeAuthCallback(value: string): NativeAuthCallback {
  try {
    const url = new URL(value)
    const next = localPath(url.searchParams.get('next'))
    const action = url.searchParams.get('action')
    const provider = url.searchParams.get('provider')
    const token = url.searchParams.get('token')
    if (
      url.protocol !== 'praetorium:' ||
      url.hostname !== 'auth' ||
      url.searchParams.has('error') ||
      !next ||
      !ACTIONS.has(String(action)) ||
      !PROVIDERS.has(String(provider)) ||
      !token ||
      token.length < 16
    ) {
      return { kind: 'error' }
    }
    return {
      kind: 'success',
      action: action as NativeAuthRequest['action'],
      provider: provider as NativeAuthRequest['provider'],
      next,
      token,
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
      const response = await fetch('/api/auth/one-time-token/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: auth.token }),
      });
      if (!response.ok) throw new Error('native auth exchange failed');
      window.ReactNativeWebView.postMessage(JSON.stringify({ version: 1, type: 'native-auth-result', ok: true }));
      window.location.replace(auth.next);
    } catch {
      window.ReactNativeWebView.postMessage(JSON.stringify({ version: 1, type: 'native-auth-result', ok: false }));
    }
  })(); true;`
}
