import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buttonClass } from '../../components/buttonClass'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/Dialog'
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
      {/* Not now stays beside the heading; the badges sit at the right, or on their own row on a phone. */}
      <p className="min-w-0 font-semibold max-sm:flex-1">Get the app</p>
      <Button size="sm" variant="ghost" onClick={() => writeStoredValue(DISMISSED_KEY, 'true')}>
        Not now
      </Button>
      <div className="flex flex-wrap items-center gap-3 max-sm:w-full sm:ml-auto">
        <a href={APP_STORE} rel="noreferrer noopener" target="_blank" className="block">
          <img src={appStoreBadge} alt="Download on the App Store" width={120} height={40} className="h-10 w-auto" />
        </a>
        {ANDROID_BETA ? <AndroidBeta group={ANDROID_BETA} /> : null}
      </div>
    </section>
  )
}

/** The badge opens the steps rather than a store page, because a closed test is reached through its testers' group. */
function AndroidBeta({ group }: { group: string }) {
  return (
    <Dialog>
      <DialogTrigger render={<button type="button" aria-label="Get it on Google Play" className="block cursor-pointer" />}>
        <img src={googlePlayBadge} alt="" width={134} height={40} className="h-10 w-auto" />
      </DialogTrigger>
      <DialogContent fit>
        <DialogHeader>
          <DialogTitle>Join the Android beta</DialogTitle>
          <DialogDescription>Praetorium for Android is in a closed test on Google Play until it opens to everyone.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ol className="list-decimal space-y-2 pl-5 font-rules text-bone/80 marker:text-dim">
            <li className="pl-1">Join the testers’ group with your Google account.</li>
            <li className="pl-1">
              On the group’s page, follow the opt-in link and choose <strong className="font-semibold text-bone">Become a tester</strong>.
            </li>
            <li className="pl-1">Install Praetorium from Google Play with the same account.</li>
          </ol>
          <p className="text-sm text-dim">
            Stay in the test for at least 14 days: Google opens the app to everyone once enough testers have.
          </p>
        </DialogBody>
        <DialogFooter className="flex-row justify-end gap-2">
          <DialogClose render={<Button variant="ghost" />}>Close</DialogClose>
          <a href={group} rel="noreferrer noopener" target="_blank" className={buttonClass()}>
            Open the testers’ group <ExternalLink aria-hidden />
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
