import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ChevronRight, Search } from 'lucide-react'
import { posthog } from 'posthog-js'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import type { GlobalSearchResult } from '../../../server/functions'
import { globalSearchQuery } from '../../queries'
import { useSettled } from '../../useSettled'
import { DatasheetMatchReasons } from '../../components/DatasheetMatchReasons'
import { matchingPages } from './globalSearchPages'
import { isSearchShortcut, searchShortcutModifier } from './globalSearchShortcut'

const groups: GlobalSearchResult['group'][] = [
  'Pages',
  'Factions',
  'Datasheets',
  'Detachments',
  'Missions',
  'Rules',
  'Your rosters',
  'Your battles',
]

type GlobalSearchContextValue = {
  open: () => void
  shortcutModifier: string
}

const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(null)

export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [shortcutModifier, setShortcutModifier] = useState('Ctrl')
  const trimmed = query.trim()
  const settled = useSettled(trimmed, 75)
  const { data = [], isFetching, isPending, isError } = useQuery({ ...globalSearchQuery(settled), placeholderData: keepPreviousData })
  const results = [...matchingPages(trimmed), ...data]
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
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search everything…" />
          <CommandList className="h-[min(60vh,30rem)] max-h-none">
            {trimmed.length >= 2 && isFetching ? <output className="sr-only">Searching</output> : null}
            {trimmed.length >= 2 && trimmed === settled && !isFetching ? <CommandEmpty>No results found.</CommandEmpty> : null}
            {groups.map((group) => {
              const items = results.filter((result) => result.group === group)
              if (!items.length) return null
              return (
                <CommandGroup
                  key={group}
                  heading={group === 'Datasheets' && items.every((result) => result.fuzzy) ? 'Close matches' : group}
                >
                  {items.map((result) => (
                    <CommandItem
                      key={result.id}
                      value={`${result.label} ${result.detail}`}
                      onSelect={() => void go(result)}
                      className="border-l-2 border-transparent data-[selected=true]:border-parchment data-[selected=true]:bg-parchment/15 data-[selected=true]:text-bone data-[selected=true]:[&_.result-detail]:text-dim"
                    >
                      <ChevronRight className="size-4 opacity-0 group-data-[selected=true]/command-item:opacity-100" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold uppercase">{result.label}</span>
                        <span className="result-detail block truncate text-xs text-dim">{result.detail}</span>
                        <DatasheetMatchReasons query={trimmed} reasons={result.matchReasons} />
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
          </CommandList>
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
        </Command>
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
          : 'ml-auto h-8 min-w-8 justify-start gap-2 border-edge bg-sunken px-2 text-dim hover:text-bone xl:w-44'
      }
      aria-label="Search Praetorium"
      onClick={search.open}
    >
      <Search className="size-4" />
      {compact ? null : <span className="hidden flex-1 text-left text-xs xl:inline">Search</span>}
      {compact ? null : (
        <KbdGroup className="hidden xl:inline-flex" aria-hidden>
          <Kbd className="h-4 min-w-4 bg-raised px-0.5 text-3xs text-faint">{search.shortcutModifier}</Kbd>
          <Kbd className="h-4 min-w-4 bg-raised px-0.5 text-3xs text-faint">K</Kbd>
        </KbdGroup>
      )}
    </Button>
  )
}
