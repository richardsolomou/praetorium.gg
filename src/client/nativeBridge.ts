import { parseLocalState, type LocalState } from '../contracts/localState'
import { useSyncExternalStore } from 'react'
import type { AppSnapshot } from '../contracts/appSnapshot'
import type { WatchBattle } from '../contracts/watchBattle'
import { NATIVE_EVENTS, type NativeEvent, type NativePushAnswer } from '../contracts/nativeBridge'

export type { NativePushAnswer }

type NativeCapability =
  | 'local-state'
  | 'app-snapshot'
  | 'account'
  | 'app-navigation'
  | 'back-gesture'
  | 'battle-active'
  | 'haptic'
  | 'github-auth'
  | 'notifications'
  | 'offline-reference'
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

type NativeAnswer = Record<string, unknown>

/**
 * Posts a request carrying a fresh id and waits for the shell to dispatch `event` with an answer that has the same
 * id and that `read` accepts, giving up after `timeoutMs`; `'unsent'` when this shell cannot take the request.
 */
function askNative<T>(
  capability: NativeCapability,
  event: NativeEvent,
  message: Record<string, unknown>,
  timeoutMs: number,
  read: (answer: NativeAnswer) => T | null,
): Promise<T | 'timeout' | 'unsent'> {
  if (!supports(capability)) return Promise.resolve('unsent')
  const id = crypto.randomUUID()
  return new Promise((resolve) => {
    const finish = (result: T | 'timeout' | 'unsent') => {
      clearTimeout(timer)
      window.removeEventListener(event, listen)
      resolve(result)
    }
    const listen = (incoming: Event) => {
      const detail = (incoming as CustomEvent<unknown>).detail
      if (!detail || typeof detail !== 'object' || (detail as NativeAnswer).id !== id) return
      const answer = read(detail as NativeAnswer)
      if (answer !== null) finish(answer)
    }
    const timer = setTimeout(() => finish('timeout'), timeoutMs)
    window.addEventListener(event, listen)
    if (!send(capability, { ...message, id })) finish('unsent')
  })
}

type NativeLocalState = { epoch: string; state: LocalState | null; saved: boolean }
export function supportsNativeLocalState() {
  return supports('local-state')
}

export async function requestNativeLocalState(
  owner: string,
  write?: { state: LocalState | null; epoch: string; expectedRevision: number },
): Promise<NativeLocalState> {
  const answer = await askNative(
    'local-state',
    NATIVE_EVENTS.localState,
    { type: 'native-local-state', owner, ...write },
    10_000,
    (detail) => detail as NativeLocalState & { error?: string },
  )
  if (answer === 'timeout') throw new Error('This device did not confirm saving your changes.')
  if (answer === 'unsent') throw new Error('Device storage is unavailable.')
  if (
    answer.error ||
    typeof answer.epoch !== 'string' ||
    (answer.state !== null && (!parseLocalState(answer.state) || answer.state.owner !== owner))
  )
    throw new Error(answer.error ?? 'Changes could not be saved on this device.')
  return answer
}

export async function exportNativeWork(state: LocalState): Promise<boolean> {
  const answer = await askNative(
    'local-state',
    NATIVE_EVENTS.exportWork,
    { type: 'native-export-work', state },
    120_000,
    (detail) => detail as { error?: string },
  )
  if (answer === 'timeout') throw new Error('The export did not finish. Try again.')
  if (answer === 'unsent') return false
  if (answer.error) throw new Error(answer.error)
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

export function supportsNativePush() {
  return supports('notifications')
}

function nativePushAnswer(answer: NativeAnswer): NativePushAnswer | null {
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
export async function requestNativePush(prompt: boolean, timeoutMs = prompt ? 120_000 : 10_000): Promise<NativePushAnswer | null> {
  const answer = await askNative('notifications', NATIVE_EVENTS.push, { type: 'native-push', prompt }, timeoutMs, nativePushAnswer)
  return typeof answer === 'string' ? null : answer
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

const savedAnswer = (answer: NativeAnswer) => answer.saved === true

export async function requestNativeAppSnapshot(snapshot: AppSnapshot | null): Promise<boolean> {
  return (
    (await askNative('app-snapshot', NATIVE_EVENTS.appSnapshot, { type: 'native-app-snapshot', snapshot }, 15_000, savedAnswer)) === true
  )
}

export async function requestNativeOfflineSave(doc: { html: string; savedAt: number }): Promise<boolean> {
  return (
    (await askNative('offline-reference', NATIVE_EVENTS.offline, { type: 'native-offline-save', ...doc }, 60_000, savedAnswer)) === true
  )
}

export function setNativeWatchBattle(snapshot: WatchBattle | null) {
  return send('watch-battle', { type: 'native-watch-battle', snapshot })
}

function subscribeCapabilities(changed: () => void) {
  window.addEventListener(NATIVE_EVENTS.capabilities, changed)
  return () => window.removeEventListener(NATIVE_EVENTS.capabilities, changed)
}

export function useNativeWatchBattleAvailability() {
  return useSyncExternalStore(
    subscribeCapabilities,
    () => supports('watch-battle'),
    () => false,
  )
}

/** Whether `shareLink` opens the system share sheet rather than copying the link. */
export function useNativeShare() {
  return useSyncExternalStore(
    subscribeCapabilities,
    () => supports('share'),
    () => false,
  )
}
