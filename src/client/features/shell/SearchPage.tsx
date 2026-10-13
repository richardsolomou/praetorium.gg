import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { globalSearchQuery } from '../../queries'
import { useSettled } from '../../useSettled'
import { matchingPages, SEARCH_DEBOUNCE_MS } from './globalSearchPages'
import { SearchResults } from './SearchResults'

export function SearchPage({ query }: { query: string }) {
  const navigate = useNavigate()
  const trimmed = query.trim()
  const settled = useSettled(trimmed, SEARCH_DEBOUNCE_MS)
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
  const results = [...matchingPages(settled), ...data]
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
            <SearchResults results={results} query={settled} />
          ) : (
            <PageState headingLevel={2} title="No results found" explanation="Try another name or search term." />
          )}
        </div>
      </PageContent>
    </main>
  )
}
