import { Check, ExternalLink, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { buttonClass } from '../../components/buttonClass'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/Dialog'
import { ANDROID_BETA, APP_STORE, GOOGLE_PLAY } from '../../projectLinks'
import { useStoredValue, writeStoredValue } from '../../storedValue'
import appStoreBadge from './app-store-badge.svg?no-inline'
import becomeTesterShot from './beta-become-tester.webp?no-inline'
import groupConfirmShot from './beta-group-confirm.webp?no-inline'
import groupJoinShot from './beta-group-join.webp?no-inline'
import installShot from './beta-install.webp?no-inline'
import googlePlayBadge from './google-play-badge.png?no-inline'

const DISMISSED_KEY = 'praetorium-apps-dismissed'

/**
 * Runs in the document head before the first paint: a band already dismissed is never drawn while the page hydrates,
 * and a phone's platform is known before the band picks which store to show.
 */
export const APPS_SCRIPT = `try{var d=document.documentElement;if(localStorage.getItem(${JSON.stringify(DISMISSED_KEY)})==='true')d.dataset.appsDismissed='true';var u=navigator.userAgent;d.dataset.platform=/iPhone|iPad|iPod/.test(u)?'ios':/Android/.test(u)?'android':''}catch(e){}`

const useDismissed = () => useStoredValue(DISMISSED_KEY) === 'true'

/*
 * The stores' own badges, unaltered: Apple's from its marketing tools, Google's with only its transparent margin
 * trimmed. Apple asks for its badge first, at least 40px tall, and Google for one at least as tall; both need a quarter
 * of their height clear around them. An Android phone sees only Google's; an iPhone never sees the band at all, because
 * Safari's own App Store banner already offers the app there.
 */
function StoreBadges() {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 max-sm:col-span-2 max-sm:row-start-2">
      <a data-store-apple href={APP_STORE} rel="noreferrer noopener" target="_blank" className="block">
        <img src={appStoreBadge} alt="Download on the App Store" width={120} height={40} className="h-10 w-auto" />
      </a>
      {ANDROID_BETA ? <AndroidBeta beta={ANDROID_BETA} /> : null}
    </div>
  )
}

/**
 * A strip along the bottom edge of Home's opening band, the hero for a visitor and the welcome for a player. A player
 * comes back daily, so theirs can be dismissed; a visitor's cannot. Hidden inside the app by `[data-store-link]`.
 */
export function AppBand({ dismissable }: { dismissable: boolean }) {
  const dismissed = useDismissed()
  if (dismissable && dismissed) return null
  return (
    <div data-store-link data-app-band data-home-apps={dismissable || undefined} className="relative border-t border-edge">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 sm:flex sm:gap-4 sm:px-6">
        <p className="text-sm leading-snug text-dim sm:min-w-0 sm:flex-1">
          <span data-platform-text="other">Take it to the table: Praetorium is on iPhone and Android.</span>
          <span data-platform-text="android">Praetorium for Android is in beta.</span>
        </p>
        <StoreBadges />
        {dismissable ? (
          <Button size="sm" variant="ghost" aria-label="Not now" onClick={() => writeStoredValue(DISMISSED_KEY, 'true')}>
            <span className="max-sm:hidden">Not now</span>
            <X className="sm:hidden" aria-hidden />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/**
 * The badge opens the steps rather than a store page, because Play admits only members of the testers' group to the
 * closed test. Each step's link opens in a new tab, so the dialog stays put and moves on to the next step. The current
 * step shows Google's own page with the button to tap ringed, captured signed in as a Gmail account that had not joined.
 */
function AndroidBeta({ beta }: { beta: { group: string; optIn: string } }) {
  const [done, setDone] = useState(0)
  const steps = [
    {
      title: 'Join the testers’ group',
      text: 'Tap Join group, then Join group again to confirm.',
      hint: 'Only see Sign in? Sign in at the top first.',
      shots: [
        { src: groupJoinShot, width: 352, height: 120, alt: 'The group page, with its Join group button ringed' },
        { src: groupConfirmShot, width: 541, height: 280, alt: 'The join form, with its Join group button ringed' },
      ],
      href: beta.group,
      action: 'Open group',
    },
    {
      title: 'Become a tester',
      text: 'Tap Become a tester on Google Play.',
      shots: [{ src: becomeTesterShot, width: 541, height: 215, alt: 'The testing page, with its Become a tester button ringed' }],
      href: beta.optIn,
      action: 'Opt in',
    },
    {
      title: 'Install Praetorium',
      text: 'From Google Play, signed in with the same Google account.',
      hint: 'Page not found? Wait a few minutes, or switch Play to that account.',
      shots: [{ src: installShot, width: 541, height: 325, alt: 'The store listing, with its Install button ringed' }],
      href: GOOGLE_PLAY,
      action: 'Install',
    },
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
            {steps.map(({ title, text, hint, shots, href, action }, at) => {
              const state = at < done ? 'done' : at === done ? 'current' : 'next'
              return (
                <li
                  key={title}
                  data-state={state}
                  className="relative grid gap-2.5 rounded-lg border border-edge bg-void/60 p-2.5 data-[state=current]:border-parchment/50 data-[state=current]:bg-raised"
                >
                  <span className="flex items-center gap-3">
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
                  </span>
                  {state === 'current' ? (
                    <span className="grid gap-2 pl-10">
                      {shots.map(({ src, width, height, alt }) => (
                        <img
                          key={src}
                          src={src}
                          alt={alt}
                          width={width}
                          height={height}
                          className="w-full max-w-72 rounded-md border border-edge"
                        />
                      ))}
                      {hint ? <span className="text-xs text-faint">{hint}</span> : null}
                    </span>
                  ) : null}
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

/** The credit lines Apple and Google ask for wherever their badges appear, kept at the page's foot and gone with the band. */
export function HomeAppCredits({ dismissable }: { dismissable: boolean }) {
  const dismissed = useDismissed()
  if (dismissable && dismissed) return null
  return (
    <p
      data-store-link
      data-app-band
      data-home-apps={dismissable || undefined}
      className="mx-auto max-w-6xl px-5 pt-4 pb-6 text-2xs leading-snug text-faint sm:px-6"
    >
      Apple and the Apple logo are trademarks of Apple Inc., registered in the U.S. and other countries. App Store is a service mark of
      Apple Inc.{ANDROID_BETA ? ' Google Play and the Google Play logo are trademarks of Google LLC.' : null}
    </p>
  )
}
