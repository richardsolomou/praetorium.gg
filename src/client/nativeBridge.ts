import { useSyncExternalStore } from 'react'

type NativeCapability =
  | 'app-snapshot'
  | 'account'
  | 'app-navigation'
  | 'back-gesture'
  | 'battle-active'
  | 'haptic'
  | 'github-auth'
  | 'notifications'
  | 'offline-reference'
  | 'open-window'
  | 'print'
  | 'share'
  | 'watch-battle'

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

export function supportsNativeOffline() {
  return supports('offline-reference')
}

export function supportsNativeAppSnapshot() {
  return supports('app-snapshot')
}

export function requestNativeAppSnapshot(snapshot: import('../contracts/appSnapshot').AppSnapshot | null): Promise<boolean> {
  if (!supportsNativeAppSnapshot()) return Promise.resolve(false)
  const id = crypto.randomUUID()
  return new Promise((resolve) => {
    const finish = (saved: boolean) => {
      clearTimeout(timer)
      window.removeEventListener('praetorium-native-app-snapshot', listen)
      resolve(saved)
    }
    const listen = (event: Event) => {
      const answer = (event as CustomEvent<{ id?: string; saved?: boolean }>).detail
      if (answer?.id === id) finish(answer.saved === true)
    }
    const timer = setTimeout(() => finish(false), 15_000)
    window.addEventListener('praetorium-native-app-snapshot', listen)
    if (!send('app-snapshot', { type: 'native-app-snapshot', id, snapshot })) finish(false)
  })
}

export function requestNativeOfflineSave(doc: { html: string; savedAt: number }): Promise<boolean> {
  if (!supportsNativeOffline()) return Promise.resolve(false)
  const id = crypto.randomUUID()
  return new Promise((resolve) => {
    const finish = (saved: boolean) => {
      clearTimeout(timer)
      window.removeEventListener('praetorium-native-offline', listen)
      resolve(saved)
    }
    const listen = (event: Event) => {
      const answer = (event as CustomEvent<{ id?: string; saved?: boolean }>).detail
      if (answer?.id === id) finish(answer.saved === true)
    }
    const timer = setTimeout(() => finish(false), 60_000)
    window.addEventListener('praetorium-native-offline', listen)
    if (!send('offline-reference', { type: 'native-offline-save', id, ...doc })) finish(false)
  })
}

export function setNativeWatchBattle(snapshot: import('../contracts/watchBattle').WatchBattle | null) {
  return send('watch-battle', { type: 'native-watch-battle', snapshot })
}

export function supportsNativeWatchBattle() {
  return supports('watch-battle')
}

export function useNativeWatchBattleAvailability() {
  return useSyncExternalStore(
    (changed) => {
      window.addEventListener('praetorium-native-capabilities', changed)
      return () => window.removeEventListener('praetorium-native-capabilities', changed)
    },
    supportsNativeWatchBattle,
    () => false,
  )
}
