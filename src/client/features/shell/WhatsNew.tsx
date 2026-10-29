import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { posthog } from 'posthog-js'
import { useEffect, useState } from 'react'
import { version } from '../../../../package.json'
import { Button } from '@/components/ui/button'
import { useDateFormatting } from '../../dates'
import { releaseNotesQuery, releaseQuery } from '../../queries'
import { newerRelease } from '../../releaseUpdate'
import { markReleaseSeen, NOTICE_INTERVAL, seenRelease, unseenReleases, useSeenRelease, useUnseenRelease } from './seenRelease'

/**
 * Says what changed at most once a week, so a day of releases reads as one summary.
 *
 * A first visit has nothing to compare against, so it only records the version.
 */
export function WhatsNewNotice() {
  const seen = useSeenRelease()
  const [now] = useState(Date.now)
  useEffect(() => {
    if (seenRelease() === null) markReleaseSeen()
  }, [])
  const due = seen !== null && newerRelease(seen.version, version) && now - seen.at >= NOTICE_INTERVAL
  const { data: notes } = useQuery({ ...releaseNotesQuery(), enabled: due })
  const { data: latest } = useQuery(releaseQuery())
  if (!due || !notes || (latest && newerRelease(version, latest.version))) return null
  const releases = unseenReleases(notes, seen.version)
  const changes = [...releases.flatMap((release) => release.features), ...releases.flatMap((release) => release.fixes)]
  if (!changes.length) return null
  return <Notice since={seen.at} changes={changes} releases={releases.length} />
}

function Notice({ since, changes, releases }: { since: number; changes: readonly string[]; releases: number }) {
  const { date } = useDateFormatting()
  const counts = { releases, changes: changes.length }
  useEffect(() => {
    posthog.capture('whats_new_notice_shown', counts)
    // Counted once per showing; the counts cannot change while it is up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const acknowledge = (action: 'opened' | 'dismissed') => {
    posthog.capture(`whats_new_notice_${action}`, counts)
    markReleaseSeen()
  }
  return (
    <aside
      aria-label="What's new"
      aria-live="polite"
      data-whats-new
      data-print-hide
      className="fixed bottom-4 left-1/2 z-40 flex w-max max-w-[min(40rem,calc(100%-1.5rem))] -translate-x-1/2 flex-wrap items-center gap-2 border border-edge-strong bg-panel p-2 text-sm shadow-lg"
    >
      <p className="min-w-0 basis-full px-2 text-bone sm:basis-0 sm:flex-1">
        <span className="font-semibold">New since {date(since)}: </span>
        <span className="line-clamp-2">
          {plainChange(changes[0]!)}
          {changes.length > 1 ? ` (and ${changes.length - 1} more)` : ''}
        </span>
      </p>
      <span className="ml-auto flex gap-2">
        <Button size="sm" variant="outline" nativeButton={false} render={<Link to="/whats-new" onClick={() => acknowledge('opened')} />}>
          See what's new
        </Button>
        <Button size="sm" variant="ghost" onClick={() => acknowledge('dismissed')}>
          Dismiss
        </Button>
      </span>
    </aside>
  )
}

/** The shell cannot afford the page's markdown renderer, so the notice drops the emphasis and code markers instead. */
const plainChange = (change: string) => change.replace(/\*\*|__|`/g, '')

/** Marks a way into What's new while this build has changes the player has not looked at; pair it with `unseenLabel`. */
export function UnseenDot() {
  return <span aria-hidden data-whats-new-unseen className="size-1.5 shrink-0 rounded-full bg-parchment" />
}

export const unseenLabel = "What's new, new changes"

export function WhatsNewLink() {
  const unseen = useUnseenRelease()
  return (
    <Link
      to="/whats-new"
      data-listed-in-more
      aria-label={unseen ? unseenLabel : undefined}
      className="inline-flex items-center gap-1.5 transition-colors hover:text-bone"
    >
      What's new
      {unseen ? <UnseenDot /> : null}
    </Link>
  )
}
