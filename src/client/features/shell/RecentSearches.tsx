import { Link } from '@tanstack/react-router'
import { ChevronRight, X } from 'lucide-react'
import { useId } from 'react'
import { Button } from '@/components/ui/button'
import type { GlobalSearchResult } from '../../functions'
import { clearRecentSearches, forgetSearch, rememberSearch, useRecentSearches } from './searchHistory'
import { SearchResultDetail } from './SearchResultDetail'

/** Results this device opened from search, shown before anything is typed. */
export function RecentSearches({ onOpen }: { onOpen?: (result: GlobalSearchResult) => void }) {
  const recent = useRecentSearches()
  const headingId = useId()
  if (!recent.length) return null
  return (
    <section aria-labelledby={headingId} className={onOpen ? 'px-1 pb-1' : undefined}>
      <div className="flex items-center justify-between gap-2 border-b border-edge pl-3">
        <h2 id={headingId} className="rubric py-2">
          Recent
        </h2>
        <Button variant="ghost" size="sm" className="pointer-coarse:h-11" onClick={clearRecentSearches}>
          Clear
        </Button>
      </div>
      <ul className={onOpen ? 'max-h-[30dvh] overflow-y-auto overscroll-contain pt-1' : 'pt-1'}>
        {recent.map((result) => {
          const content = (
            <>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold uppercase">{result.label}</span>
                <SearchResultDetail result={result} />
              </span>
              <ChevronRight className="size-4 shrink-0 text-dim" aria-hidden />
            </>
          )
          return (
            <li key={result.id} className="flex items-center gap-1 pb-1">
              {onOpen ? (
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 border-l-2 border-transparent px-3 py-3 text-left hover:bg-parchment/10"
                  onClick={() => onOpen(result)}
                >
                  {content}
                </button>
              ) : (
                <Link
                  to={result.href}
                  className="flex min-w-0 flex-1 items-center gap-2 border border-edge bg-panel px-3 py-3 hover:border-info"
                  onClick={() => rememberSearch(result)}
                >
                  {content}
                </Link>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-dim hover:text-bone pointer-coarse:size-11"
                aria-label={`Remove ${result.label} from recent searches`}
                onClick={() => forgetSearch(result.id)}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
