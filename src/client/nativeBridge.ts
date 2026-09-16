type NativeCapability = 'account' | 'app-navigation' | 'back-gesture' | 'battle-active' | 'haptic' | 'open-window' | 'print' | 'share'

declare global {
  interface Window {
    PraetoriumNative?: {
      bridgeVersion: number
      capabilities?: readonly NativeCapability[]
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

/** Whether the shell may take one history step without leaving the current tab. */
export function setNativeHistoryBack(enabled: boolean) {
  return send('back-gesture', { type: 'native-back-gesture', enabled })
}

export function setNativeNavigation(title: string, backUrl?: string, preferHistory = false) {
  return send('app-navigation', {
    type: 'native-navigation',
    title,
    ...(backUrl ? { backUrl, preferHistory } : {}),
  })
}

export function setNativeAccount(name?: string, image?: string | null) {
  return send('account', {
    type: 'native-account',
    ...(name ? { name } : {}),
    ...(image ? { image } : {}),
  })
}

export function setNativeAccountMenuOpen(open: boolean) {
  return send('account', { type: 'native-account-menu', open })
}

export async function shareLink(url: string, title?: string): Promise<'copied' | 'shared'> {
  if (send('share', { type: 'native-share', url, ...(title ? { title } : {}) })) return 'shared'
  await navigator.clipboard.writeText(url)
  return 'copied'
}
