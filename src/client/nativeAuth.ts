import type { SocialAuthProvider } from '../authConfig'

export type NativeAuthAction = 'link' | 'sign-in'

type NativeAuthRequest = {
  version: 1
  type: 'native-auth'
  action: NativeAuthAction
  provider: SocialAuthProvider
  next: string
  requestSignUp?: boolean
  sessionToken?: string
}

declare global {
  interface Window {
    PraetoriumNative?: { bridgeVersion: number }
    ReactNativeWebView?: { postMessage(message: string): void }
  }
}

export function hasNativeAuthBridge() {
  return typeof window !== 'undefined' && window.PraetoriumNative?.bridgeVersion === 1 && Boolean(window.ReactNativeWebView)
}

export function requestNativeAuth(request: Omit<NativeAuthRequest, 'type' | 'version'>) {
  if (!hasNativeAuthBridge() || !window.ReactNativeWebView) return false
  window.ReactNativeWebView.postMessage(JSON.stringify({ version: 1, type: 'native-auth', ...request } satisfies NativeAuthRequest))
  return true
}
