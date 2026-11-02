import * as Haptics from 'expo-haptics'
import { Platform } from 'react-native'
import type { Haptic } from '../../src/contracts/nativeBridge'

const IOS: Record<Haptic, () => Promise<void>> = {
  selection: () => Haptics.selectionAsync(),
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
}

const ANDROID: Record<Haptic, Haptics.AndroidHaptics> = {
  selection: Haptics.AndroidHaptics.Segment_Tick,
  light: Haptics.AndroidHaptics.Virtual_Key,
  success: Haptics.AndroidHaptics.Confirm,
  warning: Haptics.AndroidHaptics.Reject,
}

/** Plays a feel in each platform's own vocabulary for it. */
export function playHaptic(haptic: Haptic) {
  return Platform.OS === 'android' ? Haptics.performAndroidHapticsAsync(ANDROID[haptic]) : IOS[haptic]()
}
