import type { AppStateStatus } from 'react-native'

type AppLifecycle = { backgrounded: boolean }

export const WEB_RESUME_SCRIPT = `window.dispatchEvent(new Event('offline'));
window.dispatchEvent(new Event('online'));
document.dispatchEvent(new Event('visibilitychange'));
true;`

export function initialAppLifecycle(status: string | null | undefined): AppLifecycle {
  return { backgrounded: status === 'background' }
}

export function appStateChanged(lifecycle: AppLifecycle, status: AppStateStatus) {
  const backgrounded = lifecycle.backgrounded || status === 'background'
  const shouldResumeWebApp = status === 'active' && backgrounded
  return {
    lifecycle: { backgrounded: shouldResumeWebApp ? false : backgrounded },
    shouldResumeWebApp,
  }
}
