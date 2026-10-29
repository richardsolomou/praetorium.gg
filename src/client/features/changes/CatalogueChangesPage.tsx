import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Fragment, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, History } from 'lucide-react'
import type { IndexedUpdate } from '../../../contracts/catalogueChanges'
import { factionColour } from '../../components/FactionMark'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { useDateFormatting } from '../../dates'
import { catalogueChangeLogQuery } from '../../queries'
import { useOpenHashTarget } from '../../hashTarget'
import { UpdateChanges } from './UpdateChanges'
import { UpdatesNavigation } from './UpdatesNavigation'
import { changeTally } from '../../catalogueChanges'

/**
 * Every army data update, or every one that reached a faction, newest first, a page at a time.
 * Each is a row saying what it changed, which opens onto every change it recorded; a small
 * update starts open.
 */
export function CatalogueChangesPage({ before, faction }: { before?: string; faction?: { name: string; slug: string } }) {
  const { data } = useQuery(catalogueChangeLogQuery(before, faction?.slug))
  const updates = data?.updates
  useOpenHashTarget()

  return (
    <main className="w-full">
      <PageHeader
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
          <div className="divide-y divide-edge border border-edge bg-panel">
            {updates.map((update) => (
              <Update key={update.anchor} update={update} named={!faction} />
            ))}
          </div>
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

/** How many armies a row names before counting the rest. */
const NAMED_ARMIES = 4

/** The armies an update reached, by name, with any version qualifier left to its body. */
function armiesLine(update: IndexedUpdate) {
  const names = [...new Set(update.groups.flatMap((group) => group.factions.map((faction) => faction.faction.split(' · ')[0]!)))]
  const named = names.slice(0, NAMED_ARMIES).join(', ')
  return names.length > NAMED_ARMIES ? `${named} and ${names.length - NAMED_ARMIES} more` : named
}

/**
 * One update as a native disclosure, left to the browser to open and close so hydration never
 * disagrees with what the reader did. Its summary names when it landed, the armies it reached
 * and what it did, so most readers never need to open it.
 */
function Update({ update, named }: { update: IndexedUpdate; named: boolean }) {
  const { date, time } = useDateFormatting()
  const tally = changeTally(update.groups.flatMap((group) => group.changes))
  if (update.omitted) tally.push(`${update.omitted} more`)
  return (
    <details id={update.anchor} open={update.open} className="group scroll-mt-header">
      <summary className="flex cursor-pointer list-none items-start gap-3 px-3 py-3 hover:bg-raised/40 sm:px-4 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="mt-1 size-4 shrink-0 text-dim transition-transform group-open:rotate-90 group-open:text-parchment"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-baseline gap-x-3 text-base text-bone">
            <time dateTime={new Date(update.recordedAt).toISOString()}>{date(update.recordedAt)}</time>
            <span className="readout text-xs font-sans font-normal text-dim normal-case">{time(update.recordedAt)}</span>
          </h2>
          {named ? <p className="mt-0.5 text-sm text-bone">{armiesLine(update)}</p> : null}
          <p className="mt-0.5 text-xs text-dim">
            {tally.map((part, at) => (
              <Fragment key={part}>
                {at ? ' · ' : null}
                <span className="whitespace-nowrap">{part}</span>
              </Fragment>
            ))}
          </p>
        </div>
      </summary>
      <div className="px-3 pb-4 sm:pr-4 sm:pl-11">
        <UpdateChanges update={update} named={named} />
      </div>
    </details>
  )
}
