import type { SocialAuthProvider } from '../authConfig'
import { nativeBridgeVersion } from './nativeBridge'

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

function base64url(bytes: Uint8Array) {
  let value = ''
  for (const byte of bytes) value += String.fromCharCode(byte)
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

async function nativeAuthProof() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const verifier = base64url(bytes)
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  return { challenge, verifier }
}

export async function requestNativeAuth(request: Omit<NativeAuthRequest, 'challenge' | 'type' | 'verifier' | 'version'>) {
  if (!hasNativeAuthBridge() || !window.ReactNativeWebView) return false
  const version = window.PraetoriumNative!.bridgeVersion as NativeAuthRequest['version']
  const proof = version >= 2 ? await nativeAuthProof() : {}
  window.ReactNativeWebView.postMessage(JSON.stringify({ version, type: 'native-auth', ...request, ...proof } satisfies NativeAuthRequest))
  return true
}
