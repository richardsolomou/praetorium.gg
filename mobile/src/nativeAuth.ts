import { APP_URL } from './navigation'

export const NATIVE_AUTH_CALLBACK_URL = 'praetorium://auth'
const NATIVE_AUTH_EXCHANGE_KEY = 'praetorium.native-auth.exchange'
const NATIVE_AUTH_SUCCESS_QUERY = '__native_auth'
const NATIVE_AUTH_ERROR_QUERY = '__native_auth_error'

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
    if (parsed.searchParams.has(NATIVE_AUTH_SUCCESS_QUERY) || parsed.searchParams.has(NATIVE_AUTH_ERROR_QUERY)) return null
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
  return `(() => {
    const auth = ${payload};
    try {
      sessionStorage.setItem('${NATIVE_AUTH_EXCHANGE_KEY}', JSON.stringify({ id: auth.id, next: auth.next }));
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/api/auth/native-auth-token/exchange';
      for (const [name, value] of Object.entries({ id: auth.id, token: auth.token, verifier: auth.verifier, navigation: '1' })) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.append(input);
      }
      document.documentElement.append(form);
      form.submit();
    } catch {
      window.ReactNativeWebView.postMessage(JSON.stringify({ version: 2, type: 'native-auth-result', id: auth.id, ok: false, retryable: true }));
    }
  })(); true;`
}

export const NATIVE_AUTH_COMPLETION_SCRIPT = `(() => {
  try {
    const pending = JSON.parse(sessionStorage.getItem('${NATIVE_AUTH_EXCHANGE_KEY}') || 'null');
    if (!pending || typeof pending.id !== 'string' || typeof pending.next !== 'string') return;
    const current = new URL(location.href);
    const success = current.searchParams.get('${NATIVE_AUTH_SUCCESS_QUERY}') === pending.id;
    const failed = current.searchParams.get('${NATIVE_AUTH_ERROR_QUERY}') === pending.id;
    if (!success && !failed) return;
    current.searchParams.delete('${NATIVE_AUTH_SUCCESS_QUERY}');
    current.searchParams.delete('${NATIVE_AUTH_ERROR_QUERY}');
    if (success) {
      const expected = new URL(pending.next, '${APP_URL}');
      if (expected.origin !== '${APP_URL}' || expected.href !== current.href) return;
    }
    history.replaceState(history.state, '', current.href);
    const report = () => window.ReactNativeWebView.postMessage(JSON.stringify({ version: 2, type: 'native-auth-result', id: pending.id, ok: success, retryable: false }));
    if (document.readyState === 'complete') report();
    else addEventListener('load', report, { once: true });
  } catch {}
})(); true;`

export function nativeAuthConsumeScript(callback: Extract<NativeAuthCallback, { kind: 'success' }>) {
  const payload = JSON.stringify({ id: callback.id, token: callback.token, verifier: callback.verifier })
  return `sessionStorage.removeItem('${NATIVE_AUTH_EXCHANGE_KEY}');
  void fetch('/api/auth/native-auth-token/consume', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(${payload}),
  }).then(() => location.reload(), () => location.reload()); true;`
}
