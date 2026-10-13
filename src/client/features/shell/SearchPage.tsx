import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatasheetMatchReasons } from '../../components/DatasheetMatchReasons'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { globalSearchQuery } from '../../queries'
import { useSettled } from '../../useSettled'
import { useState } from 'react'
import { globalSearchGroups, matchingPages, SEARCH_RESULT_BATCH_SIZE } from './globalSearchPages'
import { SearchResultDetail } from './SearchResultDetail'

export function SearchPage({ query }: { query: string }) {
  const navigate = useNavigate()
  const [visibleCount, setVisibleCount] = useState(SEARCH_RESULT_BATCH_SIZE)
  const trimmed = query.trim()
  const settled = useSettled(trimmed, 75)
  const {
    data = [],
    isPending,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    ...globalSearchQuery(settled),
    placeholderData: keepPreviousData,
  })
  const results = [...matchingPages(trimmed), ...data]
  const searchable = trimmed.length >= 2
  const searching = trimmed !== settled || isFetching

  return (
    <main className="w-full">
      <PageHeader eyebrow="Praetorium" title="Search" description="Find factions, datasheets, rules, rosters and battles." />
      <PageContent>
        <search>
          <Input
            type="search"
            value={query}
            onChange={(event) => {
              setVisibleCount(SEARCH_RESULT_BATCH_SIZE)
              void navigate({ to: '/search', search: { q: event.target.value }, replace: true, resetScroll: false })
            }}
            aria-label="Search Praetorium"
            placeholder="Search everything…"
            maxLength={80}
            className="min-w-0 flex-1"
          />
        </search>
        <div className="mt-4" aria-live="polite">
          {searchable && searching ? <output className="sr-only">Searching</output> : null}
          {!searchable ? (
            <p className="text-sm text-dim">Enter at least two characters to search.</p>
          ) : isError ? (
            <PageState
              headingLevel={2}
              title="Search unavailable"
              explanation="Try searching again."
              action={<Button onClick={() => void refetch()}>Retry</Button>}
            />
          ) : (isPending || searching) && !results.length ? (
            <PageState headingLevel={2} loading title="Searching" explanation="Finding matching results." />
          ) : results.length ? (
            globalSearchGroups.map((group) => {
              const items = results.filter((result) => result.group === group)
              if (!items.length) return null
              return (
                <section key={group} className="mb-5">
                  <h2 className="rubric border-b border-edge pb-2">
                    {group === 'Datasheets' && items.every((item) => item.fuzzy) ? 'Close matches' : group}
                  </h2>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {items.slice(0, visibleCount).map((result) => (
                      <Link
                        key={result.id}
                        to={result.href}
                        className="flex min-w-0 items-center justify-between gap-2 border border-edge bg-panel px-3 py-3 hover:border-info"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-bold uppercase">{result.label}</span>
                          <SearchResultDetail result={result} />
                          <DatasheetMatchReasons query={settled} reasons={result.matchReasons} />
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-dim" aria-hidden />
                      </Link>
                    ))}
                  </div>
                  {items.length > visibleCount ? (
                    <Button variant="outline" className="mt-2" onClick={() => setVisibleCount((count) => count + SEARCH_RESULT_BATCH_SIZE)}>
                      Show more {group.toLowerCase()}
                    </Button>
                  ) : null}
                </section>
              )
            })
          ) : (
            <PageState headingLevel={2} title="No results found" explanation="Try another name or search term." />
          )}
        </div>
      </PageContent>
    </main>
  )
}
