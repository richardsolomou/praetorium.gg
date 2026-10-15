import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useSyncExternalStore } from 'react'
import { version } from '../../../../package.json'
import { Button } from '@/components/ui/button'
import { PageContent, PageHeader } from '../../components/Page'
import { releaseNotesQuery, releaseQuery } from '../../queries'
import { newerRelease } from './releaseUpdate'
import { markReleaseSeen, seenRelease, subscribeSeenRelease, unseenChanges } from './seenRelease'
import { UpdatesNavigation } from '../changes/UpdatesNavigation'

/**
 * Says once what changed since this browser last acknowledged a release, without blocking anything.
 *
 * A first visit has nothing to compare against, so it only records the version.
 */
export function WhatsNewNotice() {
  const acknowledged = useSyncExternalStore(subscribeSeenRelease, seenRelease, () => version)
  useEffect(() => {
    if (seenRelease() === null) markReleaseSeen(version)
  }, [])
  const seen = acknowledged !== null && newerRelease(acknowledged, version) ? acknowledged : null
  const { data: notes } = useQuery({ ...releaseNotesQuery(), enabled: seen !== null })
  const { data: latest } = useQuery(releaseQuery())
  if (!seen || !notes || (latest && newerRelease(version, latest.version))) return null
  const changes = unseenChanges(notes, seen, version)
  if (!changes.length) return null
  const acknowledge = () => markReleaseSeen(version)
  return (
    <aside
      aria-label="What's new"
      aria-live="polite"
      data-whats-new
      data-print-hide
      className="fixed bottom-4 left-1/2 z-40 flex w-max max-w-[min(40rem,calc(100%-1.5rem))] -translate-x-1/2 flex-wrap items-center gap-2 border border-edge-strong bg-panel p-2 text-sm shadow-lg"
    >
      <p className="min-w-0 basis-full px-2 text-bone sm:basis-0 sm:flex-1">
        <span className="font-semibold">New: </span>
        <span className="line-clamp-2">
          {changes[0]}
          {changes.length > 1 ? ` (and ${changes.length - 1} more)` : ''}
        </span>
      </p>
      <span className="ml-auto flex gap-2">
        <Button size="sm" variant="outline" nativeButton={false} render={<Link to="/whats-new" onClick={acknowledge} />}>
          See what's new
        </Button>
        <Button size="sm" variant="ghost" onClick={acknowledge}>
          Dismiss
        </Button>
      </span>
    </aside>
  )
}

export function WhatsNewPage() {
  const { data: notes } = useQuery(releaseNotesQuery())
  useEffect(() => markReleaseSeen(version), [])
  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Application"
        title="What's new"
        description="The latest improvements to army building, battle tracking and the rest of Praetorium."
      >
        <UpdatesNavigation current="app" />
      </PageHeader>
      <PageContent className="space-y-4 sm:pt-6">
        {(notes ?? []).map((note) => (
          <section
            key={note.version}
            aria-labelledby={`release-${note.version}`}
            className={`grid overflow-hidden border bg-panel sm:grid-cols-[10rem_minmax(0,1fr)] ${note.version === version ? 'border-parchment/40' : 'border-edge'}`}
          >
            <div
              className={`border-b p-4 sm:border-r sm:border-b-0 ${note.version === version ? 'border-parchment/20 bg-parchment/5' : 'border-edge bg-raised/40'}`}
            >
              <h2
                id={`release-${note.version}`}
                className="flex flex-wrap items-center justify-between gap-3 text-sm font-sans font-normal normal-case sm:block"
              >
                <span className="block">
                  <span className="eyebrow">Version</span> <span className="figure mt-1 block text-2xl text-bone">{note.version}</span>
                </span>{' '}
                {note.version === version ? <span className="chip border-parchment/30 text-parchment sm:mt-3">This version</span> : null}
              </h2>
            </div>
            <ul className="divide-y divide-edge px-4 py-1 sm:px-5">
              {note.changes.map((change) => (
                <li key={change} className="flex items-start gap-3 py-3 text-sm leading-relaxed text-bone">
                  <span aria-hidden className={`mt-2 size-1.5 shrink-0 ${note.version === version ? 'bg-parchment' : 'bg-faint'}`} />
                  <span>{change}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </PageContent>
    </main>
  )
}
