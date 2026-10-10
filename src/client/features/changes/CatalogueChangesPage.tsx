import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, History } from 'lucide-react'
import type { IndexedUpdate } from '../../../contracts/catalogueChanges'
import { factionColour } from '../../components/FactionMark'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { useDateFormatting } from '../../dates'
import { catalogueChangeLogQuery } from '../../queries'
import { useOpenHashTarget } from './hashTarget'
import { changesLabel, UpdateChanges } from './UpdateChanges'

/**
 * Every army data update, or every one that reached a faction, newest first, a page at a time.
 * Each is a row naming the factions it reached most, which opens onto every change it recorded;
 * a small update starts open.
 */
export function CatalogueChangesPage({ before, faction }: { before?: string; faction?: { name: string; slug: string } }) {
  const { data } = useQuery(catalogueChangeLogQuery(before, faction?.slug))
  const updates = data?.updates
  useOpenHashTarget()

  return (
    <main className="w-full">
      <PageHeader
        onboarding="roster-data-updates"
        tint={faction ? factionColour(faction.slug, faction.name) : undefined}
        eyebrow="Reference"
        title={faction ? `${faction.name} data updates` : 'Data updates'}
        description={
          faction
            ? `${faction.name} points, datasheets and detachments that changed each time the army data was updated, newest first.`
            : 'Points, datasheets and detachments that changed each time the army data was updated, newest first.'
        }
      />
      <PageContent className="space-y-6">
        {faction ? (
          <Link to="/data-updates" className="eyebrow flex items-center gap-1 text-info hover:text-bone">
            <ChevronLeft className="size-3.5" /> All data updates
          </Link>
        ) : null}
        {updates?.length ? (
          updates.map((update) => <Update key={update.anchor} update={update} named={!faction} />)
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
              <PageLink faction={faction} className="text-info hover:text-bone">
                Newest updates
              </PageLink>
            ) : (
              <span />
            )}
            {data?.older ? (
              <PageLink faction={faction} before={data.older} className="text-info hover:text-bone">
                Older updates
              </PageLink>
            ) : null}
          </nav>
        ) : null}
      </PageContent>
    </main>
  )
}

/** A link to another page of the same list of updates. */
function PageLink({
  faction,
  before,
  className,
  children,
}: {
  faction?: { slug: string }
  before?: string
  className: string
  children: ReactNode
}) {
  const search = before ? { before } : {}
  return faction ? (
    <Link to="/data-updates/$catalogueId" params={{ catalogueId: faction.slug }} search={search} className={className}>
      {children}
    </Link>
  ) : (
    <Link to="/data-updates" search={search} className={className}>
      {children}
    </Link>
  )
}

/**
 * One update as a native disclosure, left to the browser to open and close so hydration never
 * disagrees with what the reader did. Its faction links are fragments into its own body, and a
 * faction's own page, where there is only one, leaves them out.
 */
function Update({ update, named }: { update: IndexedUpdate; named: boolean }) {
  const { date, time } = useDateFormatting()
  const when = `${date(update.recordedAt)} ${time(update.recordedAt)}`
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
        {named ? (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border border-edge bg-panel px-3 py-2.5 text-sm">
            {update.factions.map((faction) => (
              <a key={faction.anchor} href={`#${faction.anchor}`} className="text-parchment hover:text-bone">
                {faction.faction} <span className="readout text-dim">{faction.count}</span>
              </a>
            ))}
            {update.more ? <span className="text-dim">+{update.more} more</span> : null}
          </div>
        ) : null}
      </summary>
      <div className="mt-3">
        <UpdateChanges update={update.changes} />
      </div>
    </details>
  )
}
