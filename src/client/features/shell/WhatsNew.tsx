import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { version } from '../../../../package.json'
import { Button } from '@/components/ui/button'
import { PageContent, PageHeader } from '../../components/Page'
import { releaseNotesQuery, releaseQuery } from '../../queries'
import { newerRelease } from './releaseUpdate'
import { markReleaseSeen, seenRelease, unseenChanges } from './seenRelease'

/**
 * Says once what changed since this browser last acknowledged a release, without blocking anything.
 *
 * A first visit has nothing to compare against, so it only records the version.
 */
export function WhatsNewNotice() {
  const [seen, setSeen] = useState<string | null>(null)
  useEffect(() => {
    const acknowledged = seenRelease()
    if (acknowledged === null) markReleaseSeen(version)
    else if (newerRelease(acknowledged, version)) setSeen(acknowledged)
  }, [])
  const { data: notes } = useQuery({ ...releaseNotesQuery(), enabled: seen !== null })
  const { data: latest } = useQuery(releaseQuery())
  if (!seen || !notes || (latest && newerRelease(version, latest.version))) return null
  const changes = unseenChanges(notes, seen, version)
  if (!changes.length) return null
  const acknowledge = () => {
    markReleaseSeen(version)
    setSeen(null)
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
        description={
          <>
            Changes to the Praetorium app, newest first. Points and datasheet changes are listed under{' '}
            <Link to="/data-updates" className="text-info hover:text-parchment">
              Data updates
            </Link>
            .
          </>
        }
      />
      <PageContent className="space-y-6">
        {(notes ?? []).map((note) => (
          <section key={note.version} aria-labelledby={`release-${note.version}`}>
            <h2 id={`release-${note.version}`} className="rubric border-b border-edge pb-2">
              Version <span className="readout">{note.version}</span>
              {note.version === version ? <span className="ml-2 text-xs text-dim normal-case">This version</span> : null}
            </h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 font-rules text-sm text-dim">
              {note.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          </section>
        ))}
      </PageContent>
    </main>
  )
}
