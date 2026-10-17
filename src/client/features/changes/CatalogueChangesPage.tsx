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
import { UpdateChanges } from './UpdateChanges'
import { UpdateFactionLabel } from './UpdateFactionLabel'
import { UpdatesNavigation } from './UpdatesNavigation'
import { countLabel } from '../../text'

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
        eyebrow="Updates"
        title={faction ? `${faction.name} data updates` : 'Data updates'}
        description={
          faction
            ? `Track changes to ${faction.name} points, datasheets and detachments.`
            : 'Follow points changes, new datasheets and detachment updates across every army.'
        }
      >
        <UpdatesNavigation current="data" />
      </PageHeader>
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
              updates ? 'Points and datasheet changes appear here after the next data update.' : 'The list of army data updates is loading.'
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
  return (
    <details id={update.anchor} open={update.open} className="group scroll-mt-16 border border-edge bg-panel open:border-edge-strong">
      <summary className="cursor-pointer list-none p-4 hover:bg-raised/40 sm:p-5 [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-3 text-lg text-bone sm:text-xl">
            <span className="grid size-8 shrink-0 place-items-center border border-edge-strong text-dim group-open:border-parchment/30 group-open:text-parchment">
              <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
            </span>
            <time dateTime={new Date(update.recordedAt).toISOString()}>
              <span className="block">{date(update.recordedAt)}</span>{' '}
              <span className="readout mt-0.5 block text-xs font-sans font-normal text-dim">{time(update.recordedAt)}</span>
            </time>
          </h2>
          <p className="chip border-info/25 bg-info/5 px-2 py-1 text-info">{countLabel(update.total, 'change')}</p>
        </div>
        {named ? (
          <div className="mt-3 grid gap-x-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {update.factions.map((faction) => {
              const linked = update.changes.factions.find((entry) => entry.anchor === faction.anchor)
              return (
                <a
                  key={faction.anchor}
                  href={`#${faction.anchor}`}
                  aria-label={`${faction.faction}, ${countLabel(faction.count, 'change')}`}
                  className="flex min-w-0 items-start justify-between gap-3 px-3 py-2 hover:bg-raised"
                >
                  <span
                    className="mt-0.5 h-4 w-0.5 shrink-0"
                    aria-hidden
                    style={{ backgroundColor: factionColour(linked?.slug ?? '', faction.faction.split(' · ')[0]) }}
                  />
                  <UpdateFactionLabel name={faction.faction} />
                  <span className="readout ml-auto shrink-0 text-xs text-dim">{faction.count}</span>
                </a>
              )
            })}
            {update.more ? <span className="self-center px-3 text-xs text-dim">+{update.more} more armies</span> : null}
          </div>
        ) : null}
      </summary>
      <div className="border-t border-edge bg-sunken/30 p-4 sm:p-5">
        <UpdateChanges update={update.changes} />
      </div>
    </details>
  )
}
