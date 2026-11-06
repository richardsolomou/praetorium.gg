import { Button } from '@/components/ui/button'
import { ANDROID_BETA, APP_STORE } from '../../projectLinks'
import { useStoredValue, writeStoredValue } from '../../storedValue'
import appStoreBadge from './app-store-badge.svg?no-inline'
import googlePlayBadge from './google-play-badge.png?no-inline'

const DISMISSED_KEY = 'praetorium-apps-dismissed'

/** Runs in the document head before the first paint, so a strip already dismissed is never drawn while the page hydrates. */
export const APPS_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(DISMISSED_KEY)})==='true')document.documentElement.dataset.appsDismissed='true'}catch(e){}`

const useDismissed = () => useStoredValue(DISMISSED_KEY) === 'true'

/*
 * The stores' own badges, unaltered: Apple's from its marketing tools, Google's with only its transparent margin
 * trimmed. Apple asks for its badge first, at least 40px tall, and Google for one at least as tall; both need a quarter
 * of their height clear around them. Hidden inside the app by `[data-store-link]`.
 */
export function HomeApps() {
  if (useDismissed()) return null
  return (
    <section data-store-link data-home-apps aria-label="Get the app" className="part flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
      {/* A phone keeps Not now beside the heading and gives the badges their own row. */}
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Get the app</span>
        {ANDROID_BETA ? <span className="block text-sm text-dim">Android is in beta.</span> : null}
      </p>
      <Button size="sm" variant="ghost" className="sm:order-last" onClick={() => writeStoredValue(DISMISSED_KEY, 'true')}>
        Not now
      </Button>
      <div className="flex flex-wrap items-center gap-3 max-sm:w-full">
        <a href={APP_STORE} rel="noreferrer noopener" target="_blank" className="block">
          <img src={appStoreBadge} alt="Download on the App Store" width={120} height={40} className="h-10 w-auto" />
        </a>
        {ANDROID_BETA ? (
          <a href={ANDROID_BETA} rel="noreferrer noopener" target="_blank" className="block">
            <img src={googlePlayBadge} alt="Join the Android beta on Google Play" width={134} height={40} className="h-10 w-auto" />
          </a>
        ) : null}
      </div>
    </section>
  )
}

/** The credit lines Apple and Google ask for wherever their badges appear, kept at the page's foot. */
export function HomeAppCredits() {
  if (useDismissed()) return null
  return (
    <p data-store-link data-home-apps className="mx-auto max-w-6xl px-5 pt-4 pb-6 text-2xs leading-snug text-faint sm:px-6">
      Apple and the Apple logo are trademarks of Apple Inc., registered in the U.S. and other countries. App Store is a service mark of
      Apple Inc.{ANDROID_BETA ? ' Google Play and the Google Play logo are trademarks of Google LLC.' : null}
    </p>
  )
}
