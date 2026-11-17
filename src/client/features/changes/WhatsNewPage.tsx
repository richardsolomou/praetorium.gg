import { useQuery } from '@tanstack/react-query'
import { AppWindow, Calculator, ChevronDown, CircleHelp, Gavel, ScrollText, Sparkles, Swords, Users, type LucideIcon } from 'lucide-react'
import { createElement, useEffect, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import { RELEASE_AREAS, type ReleaseArea, type ReleaseChange, type ReleaseNote } from '../../../core/releaseNotes'
import { countLabel } from '../../../core/text'
import { PageContent, PageHeader } from '../../components/Page'
import { useDateFormatting } from '../../dates'
import { useOpenHashTarget } from '../../hashTarget'
import { releaseNotesQuery } from '../../queries'
import { newerRelease } from '../../releaseUpdate'
import { useHydrated } from '../../useClientValue'
import { markReleaseSeen, seenRelease } from '../shell/seenRelease'
import { UpdatesNavigation } from './UpdatesNavigation'

/** Changesets are markdown, so an entry can carry emphasis or code; anything block-level reads as its text. */
const inline: Components = {
  code: ({ children }) => <code className="rounded-sm bg-raised px-1 py-px text-[0.9em]">{children}</code>,
}

/** Consecutive releases from the same day, since several ship most days. */
function releaseDays(notes: readonly ReleaseNote[]) {
  const days: { date: string | null; releases: ReleaseNote[] }[] = []
  for (const note of notes) {
    if (days.at(-1)?.date === note.date) days.at(-1)!.releases.push(note)
    else days.push({ date: note.date, releases: [note] })
  }
  return days
}

const featureCount = (releases: readonly ReleaseNote[]) => releases.reduce((total, release) => total + release.features.length, 0)
const fixCount = (releases: readonly ReleaseNote[]) => releases.reduce((total, release) => total + release.fixes.length, 0)

/** Each area wears the icon of the screen it lives on, so a reader finds their part of the app at a glance. */
const AREA_ICONS: Record<ReleaseArea, LucideIcon> = {
  rosters: ScrollText,
  simulator: Calculator,
  battles: Swords,
  events: Users,
  reference: Gavel,
  assistant: Sparkles,
  app: AppWindow,
}

/** How many of an area's fixes show before the rest fold away; one left over shows too, rather than a fold of one. */
const FIX_PEEK = 3

const AREAS = Object.keys(RELEASE_AREAS) as ReleaseArea[]

const areaLabel = (area: ReleaseArea | null) => (area ? RELEASE_AREAS[area] : 'Other')
const areaIcon = (area: ReleaseArea | null, className: string) =>
  createElement(area ? AREA_ICONS[area] : CircleHelp, { className, 'aria-hidden': true })
/** Sets `--area` to each area's hue, so its icon, markers and filter tint from it with `text-(--area)` and friends; whole class names, so Tailwind emits the tokens. */
const AREA_HUES: Record<ReleaseArea, string> = {
  rosters: '[--area:var(--color-area-rosters)]',
  simulator: '[--area:var(--color-area-simulator)]',
  battles: '[--area:var(--color-area-battles)]',
  events: '[--area:var(--color-area-events)]',
  reference: '[--area:var(--color-area-reference)]',
  assistant: '[--area:var(--color-area-assistant)]',
  app: '[--area:var(--color-area-app)]',
}
const areaHue = (area: ReleaseArea | null) => AREA_HUES[area ?? 'app']

/** The releases with only the changes the reader asked to see: the picked areas (every area when none is picked), and fixes unless hidden. */
function narrow(notes: readonly ReleaseNote[], picked: readonly ReleaseArea[], featuresOnly: boolean) {
  const shown = (change: ReleaseChange) => !picked.length || (change.area !== null && picked.includes(change.area))
  return notes
    .map((note) => ({ ...note, features: note.features.filter(shown), fixes: featuresOnly ? [] : note.fixes.filter(shown) }))
    .filter((note) => note.features.length + note.fixes.length)
}

export function WhatsNewPage() {
  const { data: notes } = useQuery(releaseNotesQuery())
  useOpenHashTarget()
  // Read before the effect below acknowledges this visit, and used only after hydration so the first frame matches the server's.
  const [arrival] = useState(seenRelease)
  const seen = useHydrated() ? arrival?.version : undefined
  useEffect(() => markReleaseSeen(), [])
  const fresh = (release: ReleaseNote) => seen !== undefined && newerRelease(seen, release.version)
  const [picked, setPicked] = useState<ReleaseArea[]>([])
  const [featuresOnly, setFeaturesOnly] = useState(false)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const all = narrow(notes ?? [], picked, featuresOnly)
  const days = releaseDays(all)
  const unseen = all.filter(fresh)
  const summarised = unseen.length ? unseen : all
  const dayKey = (date: string | null) => date ?? 'earlier'
  const setOpen = (key: string, open: boolean) =>
    setCollapsed((current) => {
      if (open !== current.has(key)) return current
      const next = new Set(current)
      if (open) next.delete(key)
      else next.add(key)
      return next
    })
  const allCollapsed = days.length > 0 && days.every(({ date }) => collapsed.has(dayKey(date)))
  return (
    <main className="w-full">
      <PageHeader title="What's new" description="The latest improvements to army building, battle tracking and the rest of Praetorium.">
        <UpdatesNavigation current="app" />
      </PageHeader>
      <PageContent className="sm:pt-6">
        <div className="flex items-center justify-between gap-3">
          <nav aria-label="Show" className="flex shrink-0 rounded-lg border border-edge bg-sunken p-0.5">
            {(
              [
                [false, 'Everything'],
                [true, 'New features'],
              ] as const
            ).map(([option, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={featuresOnly === option}
                onClick={() => setFeaturesOnly(option)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${featuresOnly === option ? 'bg-raised text-bone' : 'text-dim hover:text-bone'}`}
              >
                {label}
              </button>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(days.map(({ date }) => dayKey(date))))}
            className="ml-auto shrink-0 rounded-md py-1 text-xs font-semibold text-dim underline decoration-runner-hi underline-offset-4 hover:text-bone hover:decoration-bone"
          >
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        </div>
        <fieldset className="no-scrollbar -mx-3 mt-3 flex min-w-0 gap-1.5 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:px-0">
          <legend className="sr-only">Areas</legend>
          {AREAS.map((area) => {
            const on = picked.includes(area)
            return (
              <button
                key={area}
                type="button"
                aria-pressed={on}
                onClick={() => setPicked((current) => (on ? current.filter((each) => each !== area) : [...current, area]))}
                className={`${areaHue(area)} inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                  on ? 'border-(--area)/60 bg-(--area)/12 text-(--area)' : 'border-runner text-dim hover:border-runner-hi hover:text-bone'
                }`}
              >
                {areaIcon(area, 'size-3.5 shrink-0 text-(--area)')}
                {RELEASE_AREAS[area]}
              </button>
            )
          })}
        </fieldset>
        <p className="mt-5 flex flex-wrap items-baseline gap-x-1.5 text-base text-dim">
          {all.length ? (
            <>
              <Tally features={featureCount(summarised)} fixes={fixCount(summarised)} />
              <span>{unseen.length ? 'since your last visit' : `in the last ${countLabel(releaseDays(notes ?? []).length, 'day')}`}</span>
            </>
          ) : (
            'Nothing in these areas lately. Pick another area or show everything.'
          )}
        </p>
        <ol>
          {days.map(({ date, releases }) => (
            <Day
              key={dayKey(date)}
              date={date}
              releases={releases}
              isNew={releases.some(fresh)}
              open={!collapsed.has(dayKey(date))}
              onOpenChange={(open) => setOpen(dayKey(date), open)}
            />
          ))}
        </ol>
      </PageContent>
    </main>
  )
}

type Entry = { change: ReleaseChange; version: string; anchor: string | null }
type AreaGroup = { area: ReleaseArea | null; features: Entry[]; fixes: Entry[] }

/**
 * A day's changes under the part of the app they touch, in area order, features before fixes. The first entry a
 * release contributes carries its `release-<version>` anchor, so links to a release land on what it changed.
 */
function byArea(releases: readonly ReleaseNote[]) {
  const entries = (kind: 'features' | 'fixes', area: ReleaseArea | null) =>
    releases.flatMap((release) =>
      release[kind].filter((change) => change.area === area).map((change): Entry => ({ change, version: release.version, anchor: null })),
    )
  const groups = [...(Object.keys(RELEASE_AREAS) as ReleaseArea[]), null]
    .map((area): AreaGroup => ({ area, features: entries('features', area), fixes: entries('fixes', area) }))
    .filter((group) => group.features.length + group.fixes.length)
  const anchored = new Set<string>()
  for (const group of groups)
    for (const entry of [...group.features, ...group.fixes]) {
      if (anchored.has(entry.version)) continue
      anchored.add(entry.version)
      entry.anchor = `release-${entry.version}`
    }
  return groups
}

/** One release day as a disclosure: the date as its heading, then each area it touched with its new features and fixes. */
function Day({
  date,
  releases,
  isNew,
  open,
  onOpenChange,
}: {
  date: string | null
  releases: ReleaseNote[]
  isNew: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { day } = useDateFormatting()
  const id = `released-${date ?? 'earlier'}`
  return (
    <li aria-labelledby={id} className="border-t border-edge first:mt-6">
      <details open={open} onToggle={(event) => onOpenChange(event.currentTarget.open)} className="group/day">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-1 py-6 [&::-webkit-details-marker]:hidden">
          <h2 id={id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl leading-none text-bone">
            {date ? <time dateTime={date}>{day(date)}</time> : 'Earlier'}
            {isNew ? <span className="chip border-parchment/40 text-parchment">New to you</span> : null}
          </h2>
          <span className="flex items-center gap-3">
            <span className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-dim">
              <Tally features={featureCount(releases)} fixes={fixCount(releases)} />
            </span>
            <ChevronDown
              className="size-4 shrink-0 text-faint transition-transform duration-200 ease-settle group-open/day:rotate-180"
              aria-hidden
            />
          </span>
        </summary>
        <div className="space-y-6 pb-10">
          {byArea(releases).map((group) => (
            <Area key={group.area ?? 'other'} {...group} />
          ))}
        </div>
      </details>
    </li>
  )
}

/** One area of a day: its new features in full, then its first few fixes with the rest behind a one-way reveal. */
function Area({ area, features, fixes }: AreaGroup) {
  const peek = fixes.length > FIX_PEEK + 1 ? FIX_PEEK : fixes.length
  return (
    <section aria-label={areaLabel(area)} className={areaHue(area)}>
      <h3 className="flex items-center gap-2 font-sans text-base font-semibold tracking-normal text-(--area) normal-case">
        {areaIcon(area, 'size-[1.125rem] shrink-0 text-(--area)')}
        {areaLabel(area)}
      </h3>
      <div className="mt-1.5 ml-2 border-l border-edge pl-3.5">
        <Changes entries={features} feature />
        <Changes entries={fixes.slice(0, peek)} feature={false} />
        {fixes.length > peek ? (
          <details className="group/fixes">
            <summary className="ml-4 inline-flex cursor-pointer list-none rounded-md py-0.5 text-xs font-semibold text-dim underline decoration-runner-hi underline-offset-4 group-open/fixes:hidden hover:text-bone hover:decoration-bone [&::-webkit-details-marker]:hidden">
              {countLabel(fixes.length - peek, 'more fix', 'more fixes')}
            </summary>
            <Changes entries={fixes.slice(peek)} feature={false} />
          </details>
        ) : null}
      </div>
    </section>
  )
}

/** Features read in bone at body size behind a `New` chip; fixes stay smaller and dim behind a gate nub. */
function Changes({ entries, feature }: { entries: Entry[]; feature: boolean }) {
  if (!entries.length) return null
  return (
    <ul className="first:-mt-1 mt-1">
      {entries.map((entry) => (
        <li
          key={entry.change.text}
          id={entry.anchor ?? undefined}
          className={`flex scroll-mt-header items-baseline gap-2.5 leading-snug ${feature ? 'py-1 text-base text-bone' : 'py-0.5 text-sm text-dim'}`}
        >
          {feature ? (
            <span className="chip shrink-0 border-(--area)/50 bg-(--area)/10 text-(--area)">New</span>
          ) : (
            <span aria-hidden className="size-[0.3rem] shrink-0 -translate-y-[0.15rem] rotate-45 bg-(--area)/60" />
          )}
          <span>
            <ChangeText text={entry.change.text} />
          </span>
        </li>
      ))}
    </ul>
  )
}

/** A count of features and fixes, its numbers set as figures so a day's size reads at a glance. */
function Tally({ features, fixes }: { features: number; fixes: number }) {
  return (
    <>
      {features ? (
        <span>
          <span className="figure text-bone">{features}</span> {features === 1 ? 'new feature' : 'new features'}
        </span>
      ) : null}
      {features && fixes ? <span aria-hidden>·</span> : null}
      {fixes ? (
        <span>
          <span className="figure text-bone">{fixes}</span> {fixes === 1 ? 'fix' : 'fixes'}
        </span>
      ) : null}
    </>
  )
}

function ChangeText({ text }: { text: string }) {
  return (
    <Markdown allowedElements={['strong', 'em', 'code']} unwrapDisallowed components={inline}>
      {text}
    </Markdown>
  )
}
