import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import type { ReleaseNote } from '../../../core/releaseNotes'
import { countLabel } from '../../../core/text'
import { PageContent, PageHeader } from '../../components/Page'
import { useDateFormatting } from '../../dates'
import { useOpenHashTarget } from '../../hashTarget'
import { releaseNotesQuery } from '../../queries'
import { newerRelease } from '../../releaseUpdate'
import { useHydrated } from '../../useClientValue'
import { markReleaseSeen, seenRelease } from '../shell/seenRelease'
import { UpdatesNavigation } from './UpdatesNavigation'

export type WhatsNewView = 'all' | 'features'

/** Consecutive releases from the same day, since several ship most days. */
function releaseDays(notes: readonly ReleaseNote[]) {
  const days: { date: string | null; releases: ReleaseNote[] }[] = []
  for (const note of notes) {
    if (days.at(-1)?.date === note.date) days.at(-1)!.releases.push(note)
    else days.push({ date: note.date, releases: [note] })
  }
  return days
}

/** Changesets are markdown, so an entry can carry emphasis or code; anything block-level reads as its text. */
const inline: Components = {
  code: ({ children }) => <code className="rounded-sm bg-raised px-1 py-px text-[0.9em]">{children}</code>,
}

/** The tallest a release's bar in a day's strip grows, in changes; anything larger draws at full height. */
const STRIP_CHANGES = 8

export function WhatsNewPage({ view }: { view: WhatsNewView }) {
  const { data: notes } = useQuery(releaseNotesQuery())
  useOpenHashTarget()
  // Read before the effect below acknowledges this visit, and used only after hydration so the first frame matches the server's.
  const [arrival] = useState(seenRelease)
  const seen = useHydrated() ? arrival?.version : undefined
  useEffect(() => markReleaseSeen(), [])
  const fresh = (release: ReleaseNote) => seen !== undefined && newerRelease(seen, release.version)
  const featuresOnly = view === 'features'
  const all = notes ?? []
  const days = releaseDays(all).filter((day) => !featuresOnly || day.releases.some((release) => release.features.length))
  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Updates"
        title="What's new"
        description="The latest improvements to army building, battle tracking and the rest of Praetorium."
      >
        <UpdatesNavigation current="app" />
      </PageHeader>
      <PageContent className="space-y-3 sm:pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-dim">
            {countLabel(all.length, 'release')} in the last {countLabel(releaseDays(all).length, 'day')} ·{' '}
            {countLabel(
              all.reduce((total, release) => total + release.features.length, 0),
              'new feature',
            )}
          </p>
          <nav aria-label="Show" className="flex border border-edge bg-sunken p-0.5">
            {(
              [
                ['all', 'Everything'],
                ['features', 'New features'],
              ] as const
            ).map(([option, label]) => (
              <Link
                key={option}
                to="/whats-new"
                search={{ view: option === 'all' ? undefined : option }}
                aria-current={view === option ? 'page' : undefined}
                className={`eyebrow px-3 py-1.5 ${view === option ? 'bg-raised text-bone' : 'hover:text-bone'}`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="divide-y divide-edge border border-edge bg-panel">
          {days.map(({ date, releases }, index) => (
            <Day
              key={date ?? 'earlier'}
              date={date}
              releases={releases}
              fresh={fresh}
              featuresOnly={featuresOnly}
              open={featuresOnly || index === 0 || releases.some(fresh)}
            />
          ))}
        </div>
      </PageContent>
    </main>
  )
}

/**
 * One day of releases as a native disclosure, so hydration never fights what the reader opened. Its
 * summary counts the day's changes, leads with its newest feature while closed, and draws each release
 * as a bar, oldest first, lit when it brought something new, so a closed day still reads as busy or quiet.
 */
function Day({
  date,
  releases,
  fresh,
  featuresOnly,
  open,
}: {
  date: string | null
  releases: ReleaseNote[]
  fresh: (release: ReleaseNote) => boolean
  featuresOnly: boolean
  open: boolean
}) {
  const { day } = useDateFormatting()
  const id = `released-${date ?? 'earlier'}`
  const features = releases.reduce((total, release) => total + release.features.length, 0)
  const fixes = releases.reduce((total, release) => total + release.fixes.length, 0)
  const isNew = releases.some(fresh)
  const headline = releases.flatMap((release) => release.features)[0]
  return (
    <details open={open} className="group">
      <summary
        className={`flex cursor-pointer list-none items-center gap-3 px-3 py-3 hover:bg-raised/40 sm:px-4 [&::-webkit-details-marker]:hidden ${isNew ? 'bg-parchment/5' : ''}`}
      >
        <ChevronRight
          className="size-4 shrink-0 text-dim transition-transform group-open:rotate-90 group-open:text-parchment"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h2 id={id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-bone">
            {date ? <time dateTime={date}>{day(date)}</time> : 'Earlier'}
            {isNew ? <span className="chip border-parchment/30 text-parchment">New to you</span> : null}
          </h2>
          <p className="mt-0.5 text-xs text-dim">
            {[
              countLabel(releases.length, 'release'),
              features ? countLabel(features, 'new feature') : null,
              fixes ? countLabel(fixes, 'fix', 'fixes') : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {headline ? (
            <p className="mt-1.5 line-clamp-1 text-sm text-bone group-open:hidden">
              <span className="chip mr-2 border-parchment/40 text-parchment">New</span>
              <Markdown allowedElements={['strong', 'em', 'code']} unwrapDisallowed components={inline}>
                {headline}
              </Markdown>
            </p>
          ) : null}
        </div>
        <span aria-hidden className="hidden h-8 shrink-0 items-end sm:flex gap-0.5 border-b border-edge">
          {releases.toReversed().map((release) => (
            <span
              key={release.version}
              className={`w-1.5 ${release.features.length ? 'bg-parchment' : 'bg-edge-strong'}`}
              style={{
                height: `${(Math.min(release.features.length + release.fixes.length, STRIP_CHANGES) / STRIP_CHANGES) * 100}%`,
                minHeight: '0.25rem',
              }}
            />
          ))}
        </span>
      </summary>
      <ol aria-labelledby={id} className="mr-3 mb-4 ml-5 border-l border-edge sm:mr-4 sm:ml-[1.4rem]">
        {releases
          .filter((release) => !featuresOnly || release.features.length)
          .map((release) => (
            <Release key={release.version} release={featuresOnly ? { ...release, fixes: [] } : release} fresh={fresh(release)} />
          ))}
      </ol>
    </details>
  )
}

/** One release on its day's rail: its version, then what it brought before what it fixed. */
function Release({ release, fresh }: { release: ReleaseNote; fresh: boolean }) {
  return (
    <li id={`release-${release.version}`} className="relative scroll-mt-header pt-2 pb-1 pl-5 sm:pl-6">
      <span
        aria-hidden
        className={`absolute top-[0.85rem] -left-[0.22rem] size-1.5 rotate-45 ${fresh ? 'bg-parchment' : release.features.length ? 'bg-bone' : 'bg-edge-strong'}`}
      />
      <h3 className={`figure text-xs font-normal normal-case ${fresh ? 'text-parchment' : 'text-faint'}`}>{release.version}</h3>
      <ul className="mt-1">
        {release.features.map((text) => (
          <Change key={`feature-${text}`} text={text} feature />
        ))}
        {release.fixes.map((text) => (
          <Change key={`fix-${text}`} text={text} feature={false} />
        ))}
      </ul>
    </li>
  )
}

function Change({ text, feature }: { text: string; feature: boolean }) {
  return (
    <li className="flex items-baseline gap-2.5 py-1 text-sm leading-snug text-bone">
      {feature ? (
        <span className="chip shrink-0 border-parchment/40 text-parchment">New</span>
      ) : (
        <span aria-hidden className="size-1 shrink-0 -translate-y-[0.2rem] bg-faint" />
      )}
      <span>
        <Markdown allowedElements={['strong', 'em', 'code']} unwrapDisallowed components={inline}>
          {text}
        </Markdown>
      </span>
    </li>
  )
}
