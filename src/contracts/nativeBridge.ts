import type { PushPlatform } from '../core/notificationConfig'

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
