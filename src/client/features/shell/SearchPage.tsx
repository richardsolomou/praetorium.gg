import { useNavigate } from '@tanstack/react-router'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { matchingPages } from './globalSearchPages'
import { RecentSearches } from './RecentSearches'
import { SearchResults } from './SearchResults'
import { useGlobalSearch } from './useGlobalSearch'
import { SEARCH_MIN_LENGTH } from '../../../core/referenceSearch'

export function SearchPage({ query }: { query: string }) {
  const navigate = useNavigate()
  const trimmed = query.trim()
  const { query: settled, data, isPending, isFetching, isError, refetch } = useGlobalSearch(trimmed)
  const results = [...matchingPages(settled), ...data]
  const searchable = trimmed.length >= SEARCH_MIN_LENGTH
  const searching = trimmed !== settled || isFetching
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <main className="w-full">
      <PageHeader eyebrow="Praetorium" title="Search" description="Find factions, datasheets, rules, rosters and battles." />
      <PageContent>
        <search>
          <Input
            ref={inputRef}
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
        {trimmed ? null : (
          <div className="mt-4">
            <RecentSearches onEmptied={() => inputRef.current?.focus()} />
          </div>
        )}
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
