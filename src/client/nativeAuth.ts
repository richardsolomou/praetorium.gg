import { useClientValue } from './useClientValue'
import type { SocialAuthProvider } from '../authConfig'
import { nativeBridgeVersion } from './nativeBridge'
import { toBase64Url } from '../core/base64'

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
 * Where the provider takes what the native shell asked for. This browser is never signed in to Praetorium: the
 * provider's answer is kept for the shell, which alone holds the verifier that collects it.
 */
export function startNativeAuth(request: {
  action: NativeAuthAction
  bridge: 2 | 3
  challenge: string
  provider: SocialAuthProvider
  next: string
  requestSignUp?: boolean
}) {
  return fetch('/api/auth/native-auth-token/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  }).then(async (response) => (response.ok ? ((await response.json()) as { url: string }).url : null))
}
