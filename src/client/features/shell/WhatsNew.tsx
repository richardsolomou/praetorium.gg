import { useQuery } from '@tanstack/react-query'
import { version } from '../../../../package.json'
import { PageContent, PageHeader } from '../../components/Page'
import { releaseNotesQuery } from '../../queries'
import { UpdatesNavigation } from '../changes/UpdatesNavigation'

export function WhatsNewPage() {
  const { data: notes } = useQuery(releaseNotesQuery())
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
