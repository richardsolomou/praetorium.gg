import { requireOptionalNativeModule, type NativeModule } from 'expo'

declare class WebSwipe extends NativeModule {
  setBackSwipe(enabled: boolean): Promise<boolean>
  setCover?(covered: boolean): Promise<void>
}

const webSwipe = requireOptionalNativeModule<WebSwipe>('PraetoriumWebSwipe')

/** Whether this build gates the iOS back swipe natively, keeping WebKit's swipe snapshots. */
export const canGateBackSwipe = webSwipe !== null

/** Whether this build can freeze the screen while the page draws screens it passes through; older builds cannot. */
export const canCoverScreen = typeof webSwipe?.setCover === 'function'

/** Resolves false when the gate cannot find WebKit's back-swipe recognizer. */
export async function setBackSwipe(enabled: boolean) {
  try {
    return (await webSwipe?.setBackSwipe(enabled)) ?? false
  } catch {
    return false
  }
}

export async function setScreenCover(covered: boolean) {
  await webSwipe?.setCover?.(covered).catch(() => undefined)
}
