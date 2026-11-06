import { ANDROID_BETA, APP_STORE } from '../../projectLinks'
import appStoreBadge from './app-store-badge.svg?no-inline'
import googlePlayBadge from './google-play-badge.png?no-inline'

/*
 * The stores' own badges, unaltered: Apple's from its marketing tools, Google's with only its transparent margin
 * trimmed. Apple asks for its badge first and Google for one at least as tall; both need a quarter of their height
 * clear around them and the credit lines below. Hidden inside the app by `[data-store-link]`.
 */
export function HomeApps() {
  return (
    <section
      data-store-link
      aria-labelledby="home-apps"
      className="part grid gap-5 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
    >
      <div>
        <h2 id="home-apps" className="text-2xl leading-none">
          Take Praetorium to the table
        </h2>
        <p className="mt-3 max-w-xl font-rules text-bone/80">
          The app keeps your lists and battles a tap away, works offline, holds the screen awake during a game, notifies you about your
          games and puts a live battle on your Apple Watch.
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <a href={APP_STORE} rel="noreferrer noopener" target="_blank" className="block">
          <img src={appStoreBadge} alt="Download on the App Store" width={144} height={48} className="h-12 w-auto" />
        </a>
        {ANDROID_BETA ? (
          <div>
            <a
              href={ANDROID_BETA}
              rel="noreferrer noopener"
              target="_blank"
              className="block"
              aria-label="Join the Android beta on Google Play"
            >
              <img src={googlePlayBadge} alt="" width={161} height={48} className="h-12 w-auto" />
            </a>
            <p className="mt-1.5 max-w-[10rem] text-xs leading-snug text-faint">Beta: join the testers’ group, then install.</p>
          </div>
        ) : null}
      </div>
      <p className="text-2xs leading-snug text-faint md:col-span-2">
        Apple and the Apple logo are trademarks of Apple Inc., registered in the U.S. and other countries. App Store is a service mark of
        Apple Inc.{ANDROID_BETA ? ' Google Play and the Google Play logo are trademarks of Google LLC.' : null}
      </p>
    </section>
  )
}
