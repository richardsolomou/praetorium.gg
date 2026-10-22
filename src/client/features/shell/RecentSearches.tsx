import { Link } from '@tanstack/react-router'
import { ChevronRight, X } from 'lucide-react'
import { useId, useRef } from 'react'
import { Button } from '@/components/ui/button'
import type { GlobalSearchResult } from '../../functions'
import { clearRecentSearches, forgetSearch, rememberSearch, useRecentSearches } from './searchHistory'
import { SearchResultDetail } from './SearchResultDetail'

/**
 * Results this device opened from search, shown before anything is typed. Removing one moves focus to its neighbour,
 * or to `onEmptied`'s target once none are left, so a keyboard user keeps their place.
 */
export function RecentSearches({ onOpen, onEmptied }: { onOpen?: (result: GlobalSearchResult) => void; onEmptied: () => void }) {
  const recent = useRecentSearches()
  const headingId = useId()
  const rows = useRef(new Map<string, HTMLElement>())
  const row = (id: string) => (node: HTMLElement | null) => {
    if (node) rows.current.set(id, node)
    else rows.current.delete(id)
  }
  const remove = (index: number) => {
    const neighbour = recent[index + 1] ?? recent[index - 1]
    forgetSearch(recent[index]!.id)
    if (neighbour) rows.current.get(neighbour.id)?.focus()
    else onEmptied()
  }
  if (!recent.length) return null
  return (
    <section aria-labelledby={headingId} className={onOpen ? 'px-1 pb-1' : undefined}>
      <div className="flex items-center justify-between gap-2 border-b border-edge pl-3">
        <h2 id={headingId} className="rubric py-2">
          Recent
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="pointer-coarse:h-11"
          onClick={() => {
            clearRecentSearches()
            onEmptied()
          }}
        >
          Clear
        </Button>
      </div>
      <ul className="pt-1">
        {recent.map((result, index) => {
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
                  ref={row(result.id)}
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 border-l-2 border-transparent px-3 py-3 text-left hover:bg-parchment/10"
                  onClick={() => onOpen(result)}
                >
                  {content}
                </button>
              ) : (
                <Link
                  ref={row(result.id)}
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
                onClick={() => remove(index)}
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
