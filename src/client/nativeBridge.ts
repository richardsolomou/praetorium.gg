type NativeCapability =
  | 'account'
  | 'app-navigation'
  | 'back-gesture'
  | 'battle-active'
  | 'haptic'
  | 'notifications'
  | 'open-window'
  | 'print'
  | 'share'

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

/** What the shell said about notifications on this device. */
export type NativePushAnswer =
  | { status: 'granted'; token: string; platform: 'ios' | 'android' }
  | { status: 'denied' | 'undetermined' | 'unavailable' }

/** The event the shell dispatches on `window` with its answer. */
export const NATIVE_PUSH_EVENT = 'praetorium-native-push'

export function supportsNativePush() {
  return supports('notifications')
}

function nativePushAnswer(value: unknown, id: string): NativePushAnswer | null {
  if (!value || typeof value !== 'object') return null
  const answer = value as Record<string, unknown>
  if (answer.id !== id) return null
  if (answer.status === 'granted' && typeof answer.token === 'string' && (answer.platform === 'ios' || answer.platform === 'android'))
    return { status: 'granted', token: answer.token, platform: answer.platform }
  if (answer.status === 'denied' || answer.status === 'undetermined' || answer.status === 'unavailable') return { status: answer.status }
  return null
}

/**
 * Ask the shell for this device's push token, showing the system prompt only when `prompt` says so.
 *
 * Null when the shell cannot answer, or does not within the time given: a prompt
 * waits on a person, a silent check only on the operating system.
 */
export function requestNativePush(prompt: boolean, timeoutMs = prompt ? 120_000 : 10_000): Promise<NativePushAnswer | null> {
  if (!supportsNativePush()) return Promise.resolve(null)
  const id = crypto.randomUUID()
  return new Promise((resolve) => {
    const finish = (answer: NativePushAnswer | null) => {
      clearTimeout(timer)
      window.removeEventListener(NATIVE_PUSH_EVENT, listen)
      resolve(answer)
    }
    const listen = (event: Event) => {
      const answer = nativePushAnswer((event as CustomEvent<unknown>).detail, id)
      if (answer) finish(answer)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    window.addEventListener(NATIVE_PUSH_EVENT, listen)
    if (!send('notifications', { type: 'native-push', id, prompt })) finish(null)
  })
}

export async function shareLink(url: string, title?: string): Promise<'copied' | 'shared'> {
  if (send('share', { type: 'native-share', url, ...(title ? { title } : {}) })) return 'shared'
  await navigator.clipboard.writeText(url)
  return 'copied'
}
