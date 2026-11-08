import type { PushPlatform } from '../core/notificationConfig'

/** The product token the native shell adds to its web view's user agent, the one sign of the app a server request carries. */
export const NATIVE_USER_AGENT_PRODUCT = 'PraetoriumNative'

/** Events the native shell dispatches on `window` for the web application. */
export const NATIVE_EVENTS = {
  appBack: 'praetorium-app-back',
  appSnapshot: 'praetorium-native-app-snapshot',
  capabilities: 'praetorium-native-capabilities',
  exportWork: 'praetorium-native-export-work',
  localState: 'praetorium-native-local-state',
  navigate: 'praetorium-app-navigate',
  offline: 'praetorium-native-offline',
  push: 'praetorium-native-push',
} as const

export type NativeEvent = (typeof NATIVE_EVENTS)[keyof typeof NATIVE_EVENTS]

/** What the shell said about notifications on this device. */
export type NativePushAnswer =
  | { status: 'granted'; token: string; platform: PushPlatform }
  | { status: 'denied' | 'undetermined' | 'unavailable' }

/**
 * The feels a shell plays, one job each: `selection` a choice changing, `light` a routine command taking, `success` a
 * moment that counts, `warning` something refused.
 */
export const HAPTICS = ['selection', 'light', 'success', 'warning'] as const

export type Haptic = (typeof HAPTICS)[number]
