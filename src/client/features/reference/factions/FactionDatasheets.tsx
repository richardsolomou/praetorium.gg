import { useReferenceFaction } from './useReferenceFaction'
import { FactionReferenceLink } from '../../../components/FactionReferenceLink'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, Outlet, useParams, useRouterState } from '@tanstack/react-router'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { ChevronRight, FileSearch } from 'lucide-react'
import { memo, useState } from 'react'
import type { UnitSummary } from '../../../../contracts/catalogue'
import { factionDatasheetsQuery, meQuery } from '../../../queries'
import { useSettled } from '../../../useSettled'
import { FactionMark, factionColour } from '../../../components/FactionMark'
import { FavouriteDatasheetToggle } from './FavouriteDatasheetToggle'
import { useFavouriteDatasheets } from '../../../favouriteDatasheets'
import { favouritesFirst } from '../../../favouriteFactions'
import { SearchField } from '../../../components/SearchField'
import { DatasheetMatchReasons } from '../../../components/DatasheetMatchReasons'
import { GROUPS } from '../../../unitGroups'
import { Section } from '../../rosters/builder/Section'
import { PageState } from '../../../components/PageState'
import { PageContent, PageHeader } from '../../../components/Page'

export function FactionDatasheets() {
  const { catalogueId, rulesVersion } = useParams({ strict: false })
  const path = useRouterState({ select: (state) => state.location.pathname })
  const faction = useReferenceFaction()
  const [query, setQuery] = useState('')
  const settledQuery = useSettled(query.trim())
  const { data: units = [], isPending } = useQuery({
    ...factionDatasheetsQuery(faction?.id ?? '', settledQuery),
    placeholderData: keepPreviousData,
  })
  const { data: me } = useQuery(meQuery())
  const { favourites } = useFavouriteDatasheets(Boolean(me))
  if (path !== `/factions/${catalogueId}${rulesVersion ? `/rules/${rulesVersion}` : ''}/datasheets`) return <Outlet />
  if (!faction) return null

  return (
    <main className="w-full">
      <PageHeader
        tint={factionColour(faction.slug, faction.displayName)}
        eyebrow={faction.displayName}
        title="Datasheets"
        media={<FactionMark id={faction.slug} name={faction.displayName} edition={faction.edition} icon={faction.icon} />}
      />
      <PageContent className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList className="eyebrow gap-1 text-info">
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/factions" />}>Factions</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="text-dim" />
            <BreadcrumbItem>
              <BreadcrumbLink render={<FactionReferenceLink to="/factions/$catalogueId" params={{ catalogueId: faction.slug }} />}>
                {faction.displayName}
              </BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <SearchField
          onboarding="datasheet-search"
          value={query}
          onChange={setQuery}
          placeholder="Find a datasheet"
          label="Find a datasheet"
          clearLabel="Empty the datasheet filter"
        />
        <section>
          <h2 className="rubric flex items-baseline justify-between border-b border-edge pb-2">
            <span>Datasheets</span>
            <span className="readout">{query.trim() ? units.length : (faction.references[0]?.datasheets ?? units.length)}</span>
          </h2>
          <div className="mt-2">
            {units.length ? (
              GROUPS.map((group) => {
                const rows = favouritesFirst(
                  units.filter((unit) => unit.group === group.id),
                  favourites,
                )
                return rows.length ? (
                  <Section key={group.id} title={group.plural} count={rows.length}>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {rows.map((unit) => (
                        <FactionDatasheetRow key={unit.id} catalogueId={faction.slug} unit={unit} query={settledQuery} />
                      ))}
                    </div>
                  </Section>
                ) : null
              })
            ) : (
              <PageState
                headingLevel={2}
                loading={isPending}
                icon={FileSearch}
                eyebrow={query.trim() ? 'Datasheet search' : faction.displayName}
                title={isPending ? 'Loading datasheets' : query.trim() ? 'No datasheets match' : 'No datasheets available'}
                explanation={
                  isPending
                    ? 'Loading datasheets and points.'
                    : query.trim()
                      ? 'Try another datasheet name or clear the search.'
                      : 'This faction has no datasheets in the current data.'
                }
              />
            )}
          </div>
        </section>
      </PageContent>
    </main>
  )
}

const FactionDatasheetRow = memo(function FactionDatasheetRow({
  catalogueId,
  unit,
  query,
}: {
  catalogueId: string
  unit: UnitSummary
  query: string
}) {
  return (
    <div
      data-onboarding="datasheet-row"
      data-datasheet={unit.name}
      className="flex w-full min-w-0 items-center border border-edge bg-panel [contain:layout_style] hover:border-info"
    >
      <FactionReferenceLink
        to="/factions/$catalogueId/datasheets/$entryId"
        params={{ catalogueId, entryId: unit.slug }}
        className="flex min-w-0 flex-1 items-center px-3 py-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold uppercase">{unit.name}</span>
          <DatasheetMatchReasons query={query} reasons={unit.matchReasons} fuzzy={unit.fuzzy} />
        </span>
        {unit.points === null ? null : <span className="chip ml-2 shrink-0 text-info">{unit.points} pts</span>}
        <ChevronRight className="ml-2 size-4 shrink-0 text-dim" aria-hidden />
      </FactionReferenceLink>
      <FavouriteDatasheetToggle entryId={unit.id} name={unit.name} className="size-11" />
    </div>
  )
})
