import { requireOptionalNativeModule, type NativeModule } from 'expo'

declare class WebSwipe extends NativeModule {
  setBackSwipe(enabled: boolean): Promise<boolean>
}

const webSwipe = requireOptionalNativeModule<WebSwipe>('PraetoriumWebSwipe')

/** Whether this build gates the iOS back swipe natively, keeping WebKit's swipe snapshots. */
export const canGateBackSwipe = webSwipe !== null

/** Resolves false when the gate cannot find WebKit's back-swipe recognizer. */
export async function setBackSwipe(enabled: boolean) {
  try {
    return (await webSwipe?.setBackSwipe(enabled)) ?? false
  } catch {
    return false
  }
}
