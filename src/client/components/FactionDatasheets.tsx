import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, Outlet, useParams, useRouterState } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, FileSearch } from 'lucide-react'
import { useState } from 'react'
import { collectionQuery, factionDatasheetsQuery, factionQuery } from '../queries'
import { useMounted } from '../useMounted'
import { useSettled } from '../useSettled'
import { FactionMark, factionColour } from './FactionMark'
import { CollectionToggle } from './CollectionToggle'
import { SearchField } from './SearchField'
import { GROUPS } from './builder/groups'
import { Section } from './builder/Section'
import { PageState } from './PageState'

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
  const { data: collection = [] } = useQuery(collectionQuery())
  // Favourites come from the per-user collection, resolved from the session
  // server-side. Sorting on it only after mount keeps the server and the first
  // client render in the same order, so hydration matches.
  const mounted = useMounted()
  const favourites = new Set(mounted ? collection : [])
  if (path !== `/factions/${catalogueId}/datasheets`) return <Outlet />
  if (!faction) return null

  return (
    <main className="w-full">
      <header
        className="relative overflow-hidden border-t-[3px] border-b border-edge bg-panel"
        style={{ borderTopColor: factionColour(faction.slug) }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_35%,color-mix(in_srgb,var(--color-parchment)_8%,transparent),transparent_75%)]" />
        <div className="relative mx-auto flex max-w-5xl items-center gap-3 px-3 pt-[17px] pb-5 sm:px-4 sm:pt-[25px] sm:pb-7">
          <FactionMark id={faction.slug} icon={faction.icon} />
          <span>
            <p className="eyebrow text-parchment">{faction.displayName} · Reference</p>
            <h1 className="text-3xl">Datasheets</h1>
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-3 py-4 sm:px-4">
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
              const rows = units
                .filter((unit) => unit.group === group.id)
                .toSorted((left, right) => Number(favourites.has(right.id)) - Number(favourites.has(left.id)))
              return rows.length ? (
                <Section key={group.id} title={group.plural} count={rows.length}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {rows.map((unit) => (
                      <div key={unit.id} className="flex items-center border border-edge bg-panel hover:border-info">
                        <Link
                          to="/factions/$catalogueId/datasheets/$entryId"
                          params={{ catalogueId: faction.slug, entryId: unit.slug }}
                          className="flex min-w-0 flex-1 items-center justify-between px-3 py-2"
                        >
                          <span className="truncate text-sm font-bold uppercase">{unit.name}</span>
                          {unit.points === null ? null : <span className="chip ml-2 shrink-0">{unit.points} pts</span>}
                        </Link>
                        <CollectionToggle entryId={unit.id} name={unit.name} />
                        <ChevronRight className="mr-2 size-4 shrink-0 text-dim" aria-hidden />
                      </div>
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
              explanation={
                query.trim()
                  ? 'Try another datasheet name or clear the search.'
                  : 'Pricing the faction’s datasheets from the verified catalogue.'
              }
            />
          )}
        </div>
      </div>
    </main>
  )
}
