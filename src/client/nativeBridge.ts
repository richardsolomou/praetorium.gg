type NativeCapability = 'app-navigation' | 'battle-active' | 'haptic' | 'open-window' | 'print' | 'share'

declare global {
  interface Window {
    PraetoriumNative?: {
      bridgeVersion: number
      capabilities?: readonly NativeCapability[]
      history?: { canGoBack?: boolean }
    }
    ReactNativeWebView?: { postMessage(message: string): void }
  }
}

export function nativeBridgeVersion() {
  return typeof window === 'undefined' ? undefined : window.PraetoriumNative?.bridgeVersion
}

function supports(capability: NativeCapability) {
  return (
    nativeBridgeVersion() === 3 &&
    Boolean(window.ReactNativeWebView) &&
    Boolean(window.PraetoriumNative?.capabilities?.includes(capability))
  )
}

function send(capability: NativeCapability, message: Record<string, unknown>) {
  if (!supports(capability) || !window.ReactNativeWebView) return false
  window.ReactNativeWebView.postMessage(JSON.stringify({ version: 3, ...message }))
  return true
}

export function setNativeBattleActive(active: boolean) {
  return send('battle-active', { type: 'native-battle-active', active })
}

export function requestNativeHaptic() {
  return send('haptic', { type: 'native-haptic' })
}

export function nativeCanGoBack() {
  return supports('app-navigation') && window.PraetoriumNative?.history?.canGoBack === true
}

export async function shareLink(url: string, title?: string): Promise<'copied' | 'shared'> {
  if (send('share', { type: 'native-share', url, ...(title ? { title } : {}) })) return 'shared'
  await navigator.clipboard.writeText(url)
  return 'copied'
}
