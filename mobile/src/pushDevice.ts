import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import appConfig from '../app.json'
import type { NativePushAnswer } from './nativeActions'

/** Android 13 only shows the permission prompt once the application has a channel to post in. */
const ANDROID_CHANNEL = 'default'

/**
 * This device's permission and, once granted, its push token.
 *
 * The system prompt appears only when `prompt` is true and the player has never
 * answered it; a refusal is theirs to change in the system settings.
 */
export async function pushAnswer(prompt: boolean): Promise<NativePushAnswer> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: 'Battles, friends and leagues',
      importance: Notifications.AndroidImportance.DEFAULT,
    })
  }
  let permission = await Notifications.getPermissionsAsync()
  if (prompt && permission.status === Notifications.PermissionStatus.UNDETERMINED)
    permission = await Notifications.requestPermissionsAsync()
  if (permission.status === Notifications.PermissionStatus.DENIED) return { status: 'denied' }
  if (permission.status !== Notifications.PermissionStatus.GRANTED) return { status: 'undetermined' }
  const token = await Notifications.getExpoPushTokenAsync({ projectId: appConfig.expo.extra.eas.projectId })
  return { status: 'granted', token: token.data, platform: Platform.OS === 'android' ? 'android' : 'ios' }
}
