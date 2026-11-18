import { requireOptionalNativeModule, type NativeModule } from 'expo'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import type { WatchBattle } from '../../src/contracts/watchBattle'
import { battleActivity, battleNotificationText } from './battleActivity'

declare class BattleActivityModule extends NativeModule<{ enabledChanged: (event: { enabled: boolean }) => void }> {
  isEnabled(): boolean
  show(payload: string): Promise<void>
  end(payload: string | null): Promise<void>
}

const liveActivities = requireOptionalNativeModule<BattleActivityModule>('PraetoriumBattleActivity')

const ANDROID_CHANNEL = 'battle'
const ANDROID_NOTIFICATION = 'battle'

/** Whether this device can show a battle on its Lock Screen: Live Activities allowed on iOS, notifications on Android. */
export async function battleActivityEnabled() {
  if (Platform.OS === 'android') return (await Notifications.getPermissionsAsync()).status === Notifications.PermissionStatus.GRANTED
  return liveActivities?.isEnabled() ?? false
}

/** Hears the iOS Live Activities setting change; Android's permission is read again whenever the application returns. */
export function subscribeBattleActivityEnabled(listener: (enabled: boolean) => void) {
  const subscription = liveActivities?.addListener('enabledChanged', ({ enabled }) => listener(enabled))
  return () => subscription?.remove()
}

/** Shows the battle the phone follows on the Lock Screen, ending it once the battle finishes or the phone stops following it. */
export async function showBattleActivity(snapshot: WatchBattle | null) {
  const activity = battleActivity(snapshot)
  const ended = !activity || activity.state.finished
  if (Platform.OS !== 'android') {
    if (ended) await liveActivities?.end(activity ? JSON.stringify(activity) : null)
    else await liveActivities?.show(JSON.stringify(activity))
    return
  }
  if (ended) {
    await Notifications.dismissNotificationAsync(ANDROID_NOTIFICATION)
    return
  }
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
    name: 'Current battle',
    description: 'The round, phase and score of the battle you are playing, while it lasts',
    importance: Notifications.AndroidImportance.LOW,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: false,
  })
  await Notifications.scheduleNotificationAsync({
    identifier: ANDROID_NOTIFICATION,
    content: { ...battleNotificationText(activity), data: { path: new URL(activity.url).pathname }, sticky: true, autoDismiss: false },
    trigger: { channelId: ANDROID_CHANNEL },
  })
}
