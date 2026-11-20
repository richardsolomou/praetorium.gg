import { useClientValue } from './useClientValue'
import type { SocialAuthProvider } from '../authConfig'
import { nativeBridgeVersion } from './nativeBridge'
import { toBase64Url } from '../core/base64'
import { holdingReload } from './pendingWrites'

export type NativeAuthAction = 'link' | 'sign-in'

type NativeAuthRequest = {
  version: 1 | 2 | 3
  type: 'native-auth'
  action: NativeAuthAction
  provider: SocialAuthProvider
  next: string
  requestSignUp?: boolean
  sessionToken?: string
  challenge?: string
  verifier?: string
}

export function hasNativeAuthBridge() {
  const version = nativeBridgeVersion()
  return typeof window !== 'undefined' && (version === 1 || version === 2 || version === 3) && Boolean(window.ReactNativeWebView)
}

export function canUseGithubAuth() {
  return !hasNativeAuthBridge() || (nativeBridgeVersion() === 3 && window.PraetoriumNative?.capabilities?.includes('github-auth') === true)
}

export function useGithubAuthAvailability() {
  return useClientValue(canUseGithubAuth, true)
}

async function nativeAuthProof() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const verifier = toBase64Url(bytes)
  const challenge = toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  return { challenge, verifier }
}

export async function requestNativeAuth(request: Omit<NativeAuthRequest, 'challenge' | 'type' | 'verifier' | 'version'>) {
  if (!hasNativeAuthBridge() || !window.ReactNativeWebView) return false
  const version = window.PraetoriumNative!.bridgeVersion as NativeAuthRequest['version']
  const proof = version >= 2 ? await nativeAuthProof() : {}
  window.ReactNativeWebView.postMessage(JSON.stringify({ version, type: 'native-auth', ...request, ...proof } satisfies NativeAuthRequest))
  return true
}

/**
 * Where the provider takes a link the native shell asked for. This browser holds no Praetorium session: it only proves
 * who signed in to the provider, and the shell, signed in itself, links that to its own account.
 */
export function startNativeLink(request: { bridge: 2 | 3; challenge: string; provider: SocialAuthProvider; next: string }) {
  return fetch('/api/auth/native-auth-token/link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'link', ...request }),
  }).then(async (response) => (response.ok ? ((await response.json()) as { url: string }).url : null))
}

/** The one-time token the native shell exchanges for this sign-in, bound to the shell's challenge. */
export function nativeAuthExchange(request: { action: 'sign-in'; challenge?: string; provider: SocialAuthProvider; next: string }) {
  return holdingReload(
    fetch('/api/auth/native-auth-token/generate', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    }),
  ).then(async (response) => (response.ok ? ((await response.json()) as { id: string; token: string }) : null))
}
