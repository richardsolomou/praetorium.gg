import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { posthog } from 'posthog-js'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CommandDialog } from '@/components/ui/command'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import type { GlobalSearchResult } from '../../functions'
import { globalSearchQuery } from '../../queries'
import { useSettled } from '../../useSettled'
import { globalSearchGroups, matchingPages, SEARCH_DEBOUNCE_MS } from './globalSearchPages'
import { isSearchShortcut, searchShortcutModifier } from './globalSearchShortcut'
import { SearchResults } from './SearchResults'

type GlobalSearchContextValue = {
  open: () => void
  shortcutModifier: string
}

const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(null)

export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const listId = useId()
  const [shortcutModifier, setShortcutModifier] = useState('Ctrl')
  const trimmed = query.trim()
  const settled = useSettled(trimmed, SEARCH_DEBOUNCE_MS)
  const { data = [], isFetching, isPending, isError } = useQuery({ ...globalSearchQuery(settled), placeholderData: keepPreviousData })
  const results = useMemo(
    () => globalSearchGroups.flatMap((group) => [...matchingPages(settled), ...data].filter((result) => result.group === group)),
    [data, settled],
  )
  const resultCount = results.length
  const reportedQuery = useRef<string | null>(null)
  const changeOpen = useCallback(
    (next: boolean, selected = false) => {
      if (next === open) return
      if (next) {
        reportedQuery.current = null
        posthog.capture('global_search_opened')
      } else {
        posthog.capture('global_search_closed', {
          selected,
          has_query: Boolean(trimmed),
          result_count: resultCount,
          pending: trimmed !== settled || isFetching,
          failed: isError,
        })
        setQuery('')
        setSelectedIndex(0)
      }
      setOpen(next)
    },
    [isError, isFetching, open, resultCount, settled, trimmed],
  )
  const openSearch = useCallback(() => changeOpen(true), [changeOpen])
  const context = useMemo(() => ({ open: openSearch, shortcutModifier }), [openSearch, shortcutModifier])

  useEffect(() => {
    const outcome = isError ? 'error' : 'success'
    const key = `${outcome}:${settled}`
    if (!open || settled.length < 2 || trimmed !== settled || isFetching || isPending || reportedQuery.current === key) return
    reportedQuery.current = key
    posthog.capture('global_search_completed', { outcome, result_count: isError ? 0 : resultCount })
  }, [isError, isFetching, isPending, open, resultCount, settled, trimmed])

  useEffect(() => {
    setShortcutModifier(searchShortcutModifier(navigator.userAgent))
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isSearchShortcut(event)) return
      event.preventDefault()
      changeOpen(!open)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [changeOpen, open])

  useEffect(() => {
    const openNativeSearch = () => changeOpen(true)
    document.addEventListener('praetorium:open-search', openNativeSearch)
    return () => document.removeEventListener('praetorium:open-search', openNativeSearch)
  }, [changeOpen])

  const go = async (result: GlobalSearchResult) => {
    posthog.capture('global_search_result_opened', { group: result.group, result_count: results.length, fuzzy: Boolean(result.fuzzy) })
    changeOpen(false, true)
    await navigate({ href: result.href })
  }

  return (
    <GlobalSearchContext value={context}>
      {children}
      <CommandDialog
        open={open}
        onOpenChange={(next) => changeOpen(next)}
        title="Search Praetorium"
        description="Search pages, factions, datasheets and their rules, detachments, missions, rosters and battles."
        className="top-1/2 max-w-xl -translate-y-1/2 rounded-none!"
      >
        <div className="flex flex-col bg-popover p-1">
          <input
            className="h-9 w-full border border-edge bg-sunken px-3 text-base outline-none md:text-sm focus-visible:border-info"
            role="combobox"
            aria-label="Search Praetorium"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={results.length ? `${listId}-${Math.min(selectedIndex, results.length - 1)}` : undefined}
            value={query}
            maxLength={80}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || !results.length) return
              const current = Math.min(selectedIndex, results.length - 1)
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                setSelectedIndex((current + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length)
              } else if (event.key === 'Enter') {
                event.preventDefault()
                void go(results[current]!)
              } else if ((event.key === 'Home' || event.key === 'End') && event.ctrlKey) {
                event.preventDefault()
                setSelectedIndex(event.key === 'Home' ? 0 : results.length - 1)
              }
            }}
            placeholder="Search everything…"
          />
          {trimmed.length >= 2 && isFetching ? <output className="sr-only">Searching</output> : null}
          {trimmed.length >= 2 && trimmed === settled && !isFetching && !results.length ? (
            <p className="py-6 text-center text-sm">{isError ? 'Search unavailable. Try again.' : 'No results found.'}</p>
          ) : null}
          <SearchResults
            results={results}
            query={settled}
            listId={listId}
            selectedIndex={Math.min(selectedIndex, results.length - 1)}
            onSelect={(result) => void go(result)}
          />
          <div className="flex items-center justify-end gap-3 border-t border-edge px-3 py-2 text-3xs text-dim" aria-hidden>
            <span>
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate
            </span>
            <span>
              <Kbd>↵</Kbd> open
            </span>
            <span>
              <Kbd>esc</Kbd> close
            </span>
          </div>
        </div>
      </CommandDialog>
    </GlobalSearchContext>
  )
}

export function GlobalSearch({ compact = false }: { compact?: boolean }) {
  const search = useContext(GlobalSearchContext)
  if (!search) throw new Error('GlobalSearch must be rendered inside GlobalSearchProvider.')

  return (
    <Button
      data-onboarding="global-search"
      variant={compact ? 'ghost' : 'outline'}
      size={compact ? 'icon' : 'sm'}
      className={
        compact
          ? 'size-12 shrink-0 text-dim hover:bg-raised hover:text-info'
          : 'ml-auto h-8 min-w-8 justify-start gap-2 border-edge bg-sunken px-2 text-dim hover:text-bone @min-[71.11rem]:w-44'
      }
      aria-label="Search Praetorium"
      onClick={search.open}
    >
      <Search className="size-4" />
      {compact ? null : <span className="hidden flex-1 text-left text-xs @min-[71.11rem]:inline">Search</span>}
      {compact ? null : (
        <KbdGroup className="hidden @min-[71.11rem]:inline-flex" aria-hidden>
          <Kbd className="h-4 min-w-4 bg-raised px-0.5 text-3xs text-faint">{search.shortcutModifier}</Kbd>
          <Kbd className="h-4 min-w-4 bg-raised px-0.5 text-3xs text-faint">K</Kbd>
        </KbdGroup>
      )}
    </Button>
  )
}
