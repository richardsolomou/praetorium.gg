import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import type { ReleaseNote } from '../../../core/releaseNotes'
import { PageContent, PageHeader } from '../../components/Page'
import { useDateFormatting } from '../../dates'
import { releaseNotesQuery } from '../../queries'
import { newerRelease } from '../../releaseUpdate'
import { useHydrated } from '../../useClientValue'
import { markReleaseSeen, seenRelease } from '../shell/seenRelease'
import { UpdatesNavigation } from './UpdatesNavigation'

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

function Changes({ title, changes }: { title: string; changes: { key: string; text: string; fresh: boolean }[] }) {
  if (!changes.length) return null
  return (
    <div className="py-3">
      <h3 className="eyebrow mb-2 text-dim">{title}</h3>
      <ul>
        {changes.map((change) => (
          <li key={change.key} className="flex items-start gap-3 py-2 text-sm leading-relaxed text-bone">
            <span aria-hidden className={`mt-2 size-1.5 shrink-0 ${change.fresh ? 'bg-parchment' : 'bg-faint'}`} />
            <span>
              <Markdown allowedElements={['strong', 'em', 'code']} unwrapDisallowed components={inline}>
                {change.text}
              </Markdown>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function WhatsNewPage() {
  const { data: notes } = useQuery(releaseNotesQuery())
  const { day } = useDateFormatting()
  // Read before the effect below acknowledges this visit, and used only after hydration so the first frame matches the server's.
  const [arrival] = useState(seenRelease)
  const seen = useHydrated() ? arrival?.version : undefined
  useEffect(() => markReleaseSeen(), [])
  const fresh = (release: ReleaseNote) => seen !== undefined && newerRelease(seen, release.version)
  const changes = (releases: ReleaseNote[], kind: 'features' | 'fixes') =>
    releases.flatMap((release) => release[kind].map((text, index) => ({ key: `${release.version}-${index}`, text, fresh: fresh(release) })))
  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Updates"
        title="What's new"
        description="The latest improvements to army building, battle tracking and the rest of Praetorium."
      >
        <UpdatesNavigation current="app" />
      </PageHeader>
      <PageContent className="space-y-4 sm:pt-6">
        {releaseDays(notes ?? []).map(({ date, releases }) => {
          const id = `released-${date ?? 'earlier'}`
          const isNew = releases.some(fresh)
          const versions = releases.map((release) => release.version)
          return (
            <section
              key={id}
              aria-labelledby={id}
              className={`grid overflow-hidden border bg-panel sm:grid-cols-[11rem_minmax(0,1fr)] ${isNew ? 'border-parchment/40' : 'border-edge'}`}
            >
              <div
                className={`border-b p-4 sm:border-r sm:border-b-0 ${isNew ? 'border-parchment/20 bg-parchment/5' : 'border-edge bg-raised/40'}`}
              >
                {versions.map((release) => (
                  <span key={release} id={`release-${release}`} />
                ))}
                <h2
                  id={id}
                  className="flex flex-wrap items-center justify-between gap-3 text-sm font-sans font-normal normal-case sm:block"
                >
                  <span className="block">
                    <span className="eyebrow">Released</span>{' '}
                    <span className="figure mt-1 block text-xl whitespace-nowrap text-bone">{date ? day(date) : 'Earlier'}</span>
                  </span>{' '}
                  {isNew ? <span className="chip border-parchment/30 text-parchment sm:mt-3">New to you</span> : null}
                </h2>
                <p className="mt-2 text-xs text-dim">
                  {versions.length === 1 ? `Version ${versions[0]}` : `Versions ${versions.at(-1)} to ${versions[0]}`}
                </p>
              </div>
              <div className="divide-y divide-edge px-4 sm:px-5">
                <Changes title="New" changes={changes(releases, 'features')} />
                <Changes title="Fixes and improvements" changes={changes(releases, 'fixes')} />
              </div>
            </section>
          )
        })}
      </PageContent>
    </main>
  )
}
