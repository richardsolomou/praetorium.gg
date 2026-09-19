import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, Outlet, useParams, useRouterState } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, FileSearch } from 'lucide-react'
import { memo, useState } from 'react'
import type { UnitSummary } from '../../contracts/catalogue'
import { factionDatasheetsQuery, factionQuery } from '../queries'
import { useSettled } from '../useSettled'
import { FactionMark, factionColour } from './FactionMark'
import { CollectionToggle } from './CollectionToggle'
import { SearchField } from './SearchField'
import { GROUPS } from '../features/builder/groups'
import { Section } from '../features/builder/Section'
import { PageState } from './PageState'
import { PageContent, PageHeader } from './Page'

export function FactionDatasheets() {
  const { catalogueId } = useParams({ strict: false })
  const path = useRouterState({ select: (state) => state.location.pathname })
  const { data: faction } = useQuery(factionQuery(catalogueId ?? ''))
  const [query, setQuery] = useState('')
  const settledQuery = useSettled(query.trim())
  const { data: units = [] } = useQuery({
    ...factionDatasheetsQuery(faction?.id ?? '', settledQuery),
    placeholderData: keepPreviousData,
  })
  if (path !== `/factions/${catalogueId}/datasheets`) return <Outlet />
  if (!faction) return null

  return (
    <main className="w-full">
      <PageHeader
        tint={factionColour(faction.slug)}
        eyebrow={`${faction.displayName} · Reference`}
        title="Datasheets"
        media={<FactionMark id={faction.slug} icon={faction.icon} />}
      />
      <PageContent>
        <Link
          to="/factions/$catalogueId"
          params={{ catalogueId: faction.slug }}
          className="eyebrow flex items-center gap-1 text-info hover:text-bone"
        >
          <ChevronLeft className="size-3.5" /> {faction.references[0]?.name ?? faction.displayName}
        </Link>
        <SearchField
          className="mt-4"
          value={query}
          onChange={setQuery}
          placeholder="Find a datasheet"
          label="Find a datasheet"
          clearLabel="Empty the datasheet filter"
        />
        <p className="rubric mt-5 flex items-baseline justify-between border-b border-edge pb-2">
          <span>Datasheets</span>
          <span className="readout">{query.trim() ? units.length : (faction.references[0]?.datasheets ?? units.length)}</span>
        </p>
        <div className="mt-2">
          {units.length ? (
            GROUPS.map((group) => {
              const rows = units.filter((unit) => unit.group === group.id)
              return rows.length ? (
                <Section key={group.id} title={group.plural} count={rows.length}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {rows.map((unit) => (
                      <FactionDatasheetRow key={unit.id} catalogueId={faction.slug} unit={unit} />
                    ))}
                  </div>
                </Section>
              ) : null
            })
          ) : (
            <PageState
              headingLevel={2}
              loading={!query.trim()}
              icon={FileSearch}
              eyebrow={query.trim() ? 'Datasheet search' : faction.displayName}
              title={query.trim() ? 'No datasheets match' : 'Loading datasheets'}
              explanation={query.trim() ? 'Try another datasheet name or clear the search.' : 'Loading datasheets and points.'}
            />
          )}
        </div>
      </PageContent>
    </main>
  )
}

const FactionDatasheetRow = memo(function FactionDatasheetRow({ catalogueId, unit }: { catalogueId: string; unit: UnitSummary }) {
  return (
    <div
      data-datasheet={unit.name}
      className="flex w-full min-w-0 items-center border border-edge bg-panel [contain:layout_style] hover:border-info"
    >
      <Link
        to="/factions/$catalogueId/datasheets/$entryId"
        params={{ catalogueId, entryId: unit.slug }}
        className="flex min-w-0 flex-1 items-center justify-between px-3 py-2"
      >
        <span className="truncate text-sm font-bold uppercase">{unit.name}</span>
        {unit.points === null ? null : <span className="chip ml-2 shrink-0">{unit.points} pts</span>}
      </Link>
      <CollectionToggle entryId={unit.id} name={unit.name} />
      <ChevronRight className="mr-2 size-4 shrink-0 text-dim" aria-hidden />
    </div>
  )
})
