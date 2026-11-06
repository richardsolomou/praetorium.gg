import { Check, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { buttonClass } from '../../components/buttonClass'
import { SectionHeading } from '../../components/SectionHeading'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/Dialog'
import { ANDROID_BETA, APP_STORE, GOOGLE_PLAY } from '../../projectLinks'
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
 * of their height clear around them.
 */
function StoreBadges() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <a href={APP_STORE} rel="noreferrer noopener" target="_blank" className="block">
        <img src={appStoreBadge} alt="Download on the App Store" width={120} height={40} className="h-10 w-auto" />
      </a>
      {ANDROID_BETA ? <AndroidBeta beta={ANDROID_BETA} /> : null}
    </div>
  )
}

/** A visitor meets the apps in the hero, beside the other ways in; the hero only ever greets someone signed out. */
export function HeroApps() {
  return (
    <div data-store-link className="mt-4">
      <StoreBadges />
    </div>
  )
}

/** A player's copy sits with the other short lists beside their games, until they say not now. Hidden inside the app by `[data-store-link]`. */
export function HomeApps() {
  if (useDismissed()) return null
  return (
    <section data-store-link data-home-apps aria-labelledby="home-apps">
      <SectionHeading
        id="home-apps"
        title="Get the app"
        action={
          <Button size="sm" variant="ghost" onClick={() => writeStoredValue(DISMISSED_KEY, 'true')}>
            Not now
          </Button>
        }
      />
      <div className="part space-y-3 p-4">
        <p className="text-sm text-dim">Your lists and games on your phone, with notifications and the screen kept awake at the table.</p>
        <StoreBadges />
      </div>
    </section>
  )
}

/**
 * The badge opens the steps rather than a store page, because Play admits only members of the testers' group to the
 * closed test. Each step's link opens in a new tab, so the dialog stays put and moves on to the next step.
 */
function AndroidBeta({ beta }: { beta: { group: string; optIn: string } }) {
  const [done, setDone] = useState(0)
  const steps = [
    { title: 'Join the testers’ group', text: 'Anyone can join; you won’t get email from it.', href: beta.group, action: 'Join group' },
    { title: 'Become a tester', text: 'Opt in to the beta on Google Play.', href: beta.optIn, action: 'Opt in' },
    { title: 'Install Praetorium', text: 'From Google Play, on your Android phone.', href: GOOGLE_PLAY, action: 'Install' },
  ]
  return (
    <Dialog onOpenChange={(open) => open || setDone(0)}>
      <DialogTrigger render={<button type="button" aria-label="Get it on Google Play" className="block cursor-pointer" />}>
        <img src={googlePlayBadge} alt="" width={134} height={40} className="h-10 w-auto" />
      </DialogTrigger>
      <DialogContent fit>
        <DialogHeader>
          <DialogTitle>Join the Android beta</DialogTitle>
          <DialogDescription>Three steps, all with the same Google account.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ol className="relative grid gap-3 before:absolute before:top-5 before:bottom-5 before:left-[1.1875rem] before:w-px before:bg-runner">
            {steps.map(({ title, text, href, action }, at) => {
              const state = at < done ? 'done' : at === done ? 'current' : 'next'
              return (
                <li
                  key={title}
                  data-state={state}
                  className="relative flex items-center gap-3 rounded-lg border border-edge bg-void/60 p-2.5 data-[state=current]:border-parchment/50 data-[state=current]:bg-raised"
                >
                  <span
                    aria-hidden
                    className="grid size-7 shrink-0 place-items-center rounded-full border border-runner bg-panel font-display text-sm font-bold text-dim in-data-[state=current]:border-parchment in-data-[state=current]:text-parchment in-data-[state=done]:border-achieved in-data-[state=done]:text-achieved"
                  >
                    {state === 'done' ? <Check className="size-4" /> : at + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block leading-tight font-semibold in-data-[state=done]:text-dim">{title}</span>
                    <span className="block text-sm text-dim">{text}</span>
                  </span>
                  <a
                    href={href}
                    rel="noreferrer noopener"
                    target="_blank"
                    onClick={() => setDone((current) => Math.max(current, at + 1))}
                    className={buttonClass({ size: 'sm', variant: state === 'current' ? 'default' : 'ghost' })}
                  >
                    {state === 'done' ? 'Again' : action}
                    <ExternalLink aria-hidden />
                  </a>
                </li>
              )
            })}
          </ol>
          <p className="text-sm text-dim">Stay in the test for 14 days: Google opens the app to everyone once enough testers have.</p>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The credit lines Apple and Google ask for wherever their badges appear, kept at the page's foot. A player's go with
 * their dismissable card; a visitor's hero badges always show, so theirs do too.
 */
export function HomeAppCredits({ dismissable }: { dismissable: boolean }) {
  const dismissed = useDismissed()
  if (dismissable && dismissed) return null
  return (
    <p
      data-store-link
      data-home-apps={dismissable || undefined}
      className="mx-auto max-w-6xl px-5 pt-4 pb-6 text-2xs leading-snug text-faint sm:px-6"
    >
      Apple and the Apple logo are trademarks of Apple Inc., registered in the U.S. and other countries. App Store is a service mark of
      Apple Inc.{ANDROID_BETA ? ' Google Play and the Google Play logo are trademarks of Google LLC.' : null}
    </p>
  )
}
