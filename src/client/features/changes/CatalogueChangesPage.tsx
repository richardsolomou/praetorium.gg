import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { History } from 'lucide-react'
import type { IndexedUpdate } from '../../../contracts/catalogueChanges'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { catalogueChangeLogQuery } from '../../queries'
import { changesLabel, UpdateChanges, updateTime } from './UpdateChanges'

/**
 * Every army data update, newest first, a page at a time. A small update lists its changes
 * here; a larger one is a line naming the factions it reached most, each linking to that
 * faction's part of the update's own page.
 */
export function CatalogueChangesPage({ before }: { before?: string }) {
  const { data } = useQuery(catalogueChangeLogQuery(before))
  const updates = data?.updates

  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Reference"
        title="Data updates"
        description="Points, datasheets and detachments that changed each time the army data was updated, newest first."
      />
      <PageContent className="space-y-6">
        {updates?.length ? (
          updates.map((update) => <Update key={update.id} update={update} />)
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
              <Link to="/changes" search={{}} className="text-info hover:text-bone">
                Newest updates
              </Link>
            ) : (
              <span />
            )}
            {data?.older ? (
              <Link to="/changes" search={{ before: data.older }} className="text-info hover:text-bone">
                Older updates
              </Link>
            ) : null}
          </nav>
        ) : null}
      </PageContent>
    </main>
  )
}

function Update({ update }: { update: IndexedUpdate }) {
  const when = updateTime(update.recordedAt)
  return (
    <section aria-label={`Update of ${when}`} data-update={update.id}>
      <div className="flex items-baseline justify-between gap-3 border-b border-edge pb-2">
        <h2 className="rubric readout text-bone">{when}</h2>
        <p className="rubric readout">{changesLabel(update.total)}</p>
      </div>
      {update.changes ? (
        <div className="mt-3">
          <UpdateChanges update={update.changes} />
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border border-edge bg-panel px-3 py-2.5 text-sm">
          {update.factions.map((faction) => (
            <Link
              key={faction.anchor}
              to="/changes/$update"
              params={{ update: update.id }}
              hash={faction.anchor}
              className="text-parchment hover:text-bone"
            >
              {faction.faction} <span className="readout text-dim">{faction.count}</span>
            </Link>
          ))}
          {update.more ? <span className="text-dim">+{update.more} more</span> : null}
          <Link to="/changes/$update" params={{ update: update.id }} className="ml-auto text-parchment hover:text-bone">
            View {changesLabel(update.total)} →
          </Link>
        </div>
      )}
    </section>
  )
}
