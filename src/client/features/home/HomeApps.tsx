import { Check, ExternalLink, X } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SectionHeading } from '../../components/SectionHeading'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { buttonClass } from '../../components/buttonClass'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/Dialog'
import { ANDROID_BETA, APP_STORE, CHATGPT_DIRECTORY, CLAUDE_DIRECTORY, GOOGLE_PLAY } from '../../projectLinks'
import { useStoredValue, writeStoredValue } from '../../storedValue'
import { DISMISSED_KEY } from './appsBand'
import appStoreBadge from './app-store-badge.svg?no-inline'
import chatgptLogo from './chatgpt-logo.svg?no-inline'
import claudeLogo from './claude-logo.svg?no-inline'
import becomeTesterShot from './beta-become-tester.webp?no-inline'
import groupConfirmShot from './beta-group-confirm.webp?no-inline'
import groupJoinShot from './beta-group-join.webp?no-inline'
import installShot from './beta-install.webp?no-inline'
import googlePlayBadge from './google-play-badge.png?no-inline'

const useDismissed = () => useStoredValue(DISMISSED_KEY) === 'true'

/*
 * The stores' own badges, unaltered: Apple's from its marketing tools, Google's with only its transparent margin
 * trimmed. Apple asks for its badge first, at least 40px tall, and Google for one at least as tall; both need a quarter
 * of their height clear around them. An Android phone sees only Google's; an iPhone never sees them at all, because
 * Safari's own App Store banner already offers the app there.
 */
function StoreBadges({ className, tiled = false }: { className?: string; tiled?: boolean }) {
  // Tiled, the badges fall into the caller's grid, under its heading, rather than wrapping in a row of their own.
  return (
    <div data-store-link data-app-band className={tiled ? 'contents' : cn('grid gap-1.5', className)}>
      {tiled ? null : (
        <p className="text-xs leading-none text-faint">
          <span data-platform-text="other">Take it to the table</span>
          <span data-platform-text="android">Try the Android beta</span>
        </p>
      )}
      <div className={tiled ? 'contents' : 'flex flex-wrap items-center gap-3'}>
        <span data-store-apple className="contents">
          <AppStoreBadge />
        </span>
        {ANDROID_BETA ? <AndroidBeta beta={ANDROID_BETA} /> : null}
      </div>
    </div>
  )
}

export function AppStoreBadge() {
  return (
    <a href={APP_STORE} rel="noreferrer noopener" target="_blank" className="block w-fit">
      <img src={appStoreBadge} alt="Download on the App Store" width={120} height={40} className="h-10 w-auto" />
    </a>
  )
}

export const ASSISTANTS = {
  chatgpt: { href: CHATGPT_DIRECTORY, verb: 'Use in', name: 'ChatGPT', logo: chatgptLogo },
  claude: { href: CLAUDE_DIRECTORY, verb: 'Add to', name: 'Claude', logo: claudeLogo },
}

/** Shaped like the store badges: neither OpenAI nor Anthropic publishes a badge of its own. */
export function AssistantButton({
  assistant: { href, verb, name, logo },
  className,
}: {
  assistant: (typeof ASSISTANTS)[keyof typeof ASSISTANTS]
  className?: string
}) {
  return (
    <a
      href={href}
      aria-label={`${verb} ${name}`}
      rel="noreferrer noopener"
      target="_blank"
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-[7px] border border-runner bg-panel pr-3 pl-2 transition-colors hover:border-runner-hi',
        className,
      )}
    >
      <img src={logo} alt="" width={24} height={24} className="size-6" />
      <span className="grid leading-none">
        <span className="text-2xs text-dim">{verb}</span> <span className="font-display text-base leading-tight font-semibold">{name}</span>
      </span>
    </a>
  )
}

function AssistantButtons({ tiled = false }: { tiled?: boolean }) {
  return (
    <div className={tiled ? 'contents' : 'grid gap-1.5'}>
      {tiled ? null : <p className="text-xs leading-none text-faint">Ask your AI assistant</p>}
      <div className={tiled ? 'contents' : 'flex flex-wrap items-center gap-3'}>
        {Object.values(ASSISTANTS).map((assistant) => (
          <AssistantButton key={assistant.name} assistant={assistant} className={tiled ? 'w-full' : undefined} />
        ))}
      </div>
    </div>
  )
}

/**
 * The app and the assistants as a panel at the head of a player's side column, where it is in view beside their games
 * on a wide screen and straight after them on a phone. It hides the way the band does, store half included.
 */
export function AppCard({ stores }: { stores: boolean }) {
  const dismissed = useDismissed()
  const [confirming, setConfirming] = useState(false)
  if (dismissed) return null
  return (
    <section data-home-apps aria-label="Apps">
      <SectionHeading
        title="Apps"
        action={
          <span className="flex items-center gap-1">
            <Link to="/apps" className="text-sm text-info hover:text-parchment">
              All apps
            </Link>
            <Button size="icon-sm" variant="ghost" aria-label="Hide apps" onClick={() => setConfirming(true)}>
              <X aria-hidden />
            </Button>
          </span>
        }
      />
      {/* Nothing on the page brings the panel back, so hiding it is asked once more. */}
      <ConfirmDialog
        open={confirming}
        title="Hide apps?"
        description="The app and assistant links won't show on Home on this device again."
        cancel="Keep them"
        confirm="Hide apps"
        onClose={() => setConfirming(false)}
        onConfirm={() => writeStoredValue(DISMISSED_KEY, 'true')}
      />
      {/* Two columns as wide as their widest item, centred so the margins match; each button lines up under the badge above it. */}
      <div className="part grid grid-cols-[repeat(2,max-content)] items-center justify-center gap-2.5 p-4">
        {stores ? <StoreBadges tiled /> : null}
        <AssistantButtons tiled />
      </div>
    </section>
  )
}

/**
 * A strip along the bottom edge of a visitor's hero, which stays: a player has `AppCard` instead. The stores are hidden
 * inside the app by `[data-store-link]`; the assistants show everywhere.
 */
export function AppBand() {
  return (
    <div className="relative border-t border-edge">
      <div className="mx-auto flex max-w-6xl min-w-0 flex-wrap gap-x-5 gap-y-3 px-5 py-3 sm:px-6">
        <StoreBadges className="md:border-r md:border-edge md:pr-5" />
        <AssistantButtons />
        <Link to="/apps" className="self-end text-sm leading-10 text-info hover:text-parchment">
          Gemini and more
        </Link>
      </div>
    </div>
  )
}

/**
 * The badge opens the steps rather than a store page, because Play admits only members of the testers' group to the
 * closed test. Each step's link opens in a new tab, so the dialog stays put and moves on to the next step. The current
 * step shows Google's own page with the button to tap ringed, captured signed in as a Gmail account that had not joined.
 */
export function AndroidBeta({ beta }: { beta: { group: string; optIn: string } }) {
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

/** The credit lines for the marks in the band, kept at the page's foot; each store's goes wherever its badge does. */
export function HomeAppCredits({ dismissable, stores = true, className }: { dismissable: boolean; stores?: boolean; className?: string }) {
  const dismissed = useDismissed()
  if (dismissable && dismissed) return null
  return (
    <p
      data-home-apps={dismissable || undefined}
      className={cn('mx-auto max-w-6xl px-5 pt-4 pb-6 text-2xs leading-snug text-faint sm:px-6', className)}
    >
      {stores ? (
        <span data-store-link data-app-band>
          Apple and the Apple logo are trademarks of Apple Inc., registered in the U.S. and other countries. App Store is a service mark of
          Apple Inc.{ANDROID_BETA ? ' Google Play and the Google Play logo are trademarks of Google LLC.' : null}{' '}
        </span>
      ) : null}
      ChatGPT and the OpenAI logo are trademarks of OpenAI. Claude and the Claude logo are trademarks of Anthropic, PBC.
    </p>
  )
}
