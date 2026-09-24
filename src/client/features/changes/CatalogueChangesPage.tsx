import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight, History } from 'lucide-react'
import type { IndexedUpdate } from '../../../contracts/catalogueChanges'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { catalogueChangeLogQuery } from '../../queries'
import { useOpenHashTarget } from './hashTarget'
import { changesLabel, UpdateChanges, updateTime } from './UpdateChanges'

/**
 * Every army data update, newest first, a page at a time. Each is a row naming the factions it
 * reached most, which opens onto every change it recorded; a small update starts open.
 */
export function CatalogueChangesPage({ before }: { before?: string }) {
  const { data } = useQuery(catalogueChangeLogQuery(before))
  const updates = data?.updates
  useOpenHashTarget()

  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Reference"
        title="Data updates"
        description="Points, datasheets and detachments that changed each time the army data was updated, newest first."
      />
      <PageContent className="space-y-6">
        {updates?.length ? (
          updates.map((update) => <Update key={update.anchor} update={update} />)
        ) : (
          <PageState
            headingLevel={2}
            eyebrow="Data updates"
            title={updates ? 'No updates yet' : 'Loading updates'}
            loading={!updates}
            icon={History}
            explanation={
              updates
                ? 'Nothing has changed since this site started keeping track. The next update that changes points or datasheets appears here.'
                : 'The list of army data updates is loading.'
            }
          />
        )}
        {before || data?.older ? (
          <nav aria-label="Older and newer updates" className="flex justify-between gap-3 border-t border-edge pt-4 text-sm">
            {before ? (
              <Link to="/data-updates" search={{}} className="text-info hover:text-bone">
                Newest updates
              </Link>
            ) : (
              <span />
            )}
            {data?.older ? (
              <Link to="/data-updates" search={{ before: data.older }} className="text-info hover:text-bone">
                Older updates
              </Link>
            ) : null}
          </nav>
        ) : null}
      </PageContent>
    </main>
  )
}

/**
 * One update as a native disclosure, left to the browser to open and close so hydration never
 * disagrees with what the reader did. Its faction links are fragments into its own body.
 */
function Update({ update }: { update: IndexedUpdate }) {
  const when = updateTime(update.recordedAt)
  return (
    <details id={update.anchor} open={update.open} className="group scroll-mt-16">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-baseline justify-between gap-3 border-b border-edge pb-2 group-hover:border-edge-strong">
          <h2 className="rubric readout flex items-center gap-1.5 text-bone">
            <ChevronRight className="size-4 shrink-0 self-center text-dim transition-transform group-open:rotate-90" aria-hidden />
            {when}
          </h2>
          <p className="rubric readout">{changesLabel(update.total)}</p>
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border border-edge bg-panel px-3 py-2.5 text-sm">
          {update.factions.map((faction) => (
            <a key={faction.anchor} href={`#${faction.anchor}`} className="text-parchment hover:text-bone">
              {faction.faction} <span className="readout text-dim">{faction.count}</span>
            </a>
          ))}
          {update.more ? <span className="text-dim">+{update.more} more</span> : null}
        </div>
      </summary>
      <div className="mt-3">
        <UpdateChanges update={update.changes} />
      </div>
    </details>
  )
}
