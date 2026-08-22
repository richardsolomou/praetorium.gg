import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronRight, Search } from 'lucide-react'
import posthog from 'posthog-js'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import type { GlobalSearchResult } from '../../server/functions'
import { globalSearchQuery } from '../queries'
import { useSettled } from '../useSettled'
import { matchingPages } from './globalSearchPages'
import { isSearchShortcut, searchShortcutModifier } from './globalSearchShortcut'

const groups: GlobalSearchResult['group'][] = ['Pages', 'Factions', 'Datasheets', 'Detachments', 'Missions', 'Your rosters', 'Your battles']

export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [shortcutModifier, setShortcutModifier] = useState('Ctrl')
  const trimmed = query.trim()
  const settled = useSettled(trimmed)
  const { data = [], isFetching } = useQuery({ ...globalSearchQuery(settled), placeholderData: keepPreviousData })
  const results = [...matchingPages(trimmed), ...data]

  useEffect(() => {
    setShortcutModifier(searchShortcutModifier(navigator.userAgent))
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isSearchShortcut(event)) return
      event.preventDefault()
      setOpen((current) => !current)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const go = (result: GlobalSearchResult) => {
    posthog.capture('global_search_result_opened', { group: result.group, result_count: results.length })
    setOpen(false)
    setQuery('')
    window.location.assign(result.href)
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="ml-auto h-8 min-w-8 justify-start gap-2 border-edge bg-sunken px-2 text-dim hover:text-bone sm:w-44"
        aria-label="Search Praetorium"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        <span className="hidden flex-1 text-left text-xs sm:inline">Search</span>
        <KbdGroup className="hidden sm:inline-flex" aria-hidden>
          <Kbd className="h-4 min-w-4 bg-raised px-0.5 text-[0.625rem] text-faint">{shortcutModifier}</Kbd>
          <Kbd className="h-4 min-w-4 bg-raised px-0.5 text-[0.625rem] text-faint">K</Kbd>
        </KbdGroup>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setQuery('')
        }}
        title="Search Praetorium"
        description="Search pages, factions, datasheets, detachments, missions, rosters and battles."
        className="top-1/2 max-w-xl -translate-y-1/2 rounded-none! border border-edge bg-panel"
      >
        <Command>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search everything…" />
          <CommandList className="h-[min(60vh,30rem)] max-h-none">
            {trimmed.length >= 2 && isFetching ? <output className="sr-only">Searching</output> : null}
            {trimmed.length >= 2 && trimmed === settled && !isFetching ? <CommandEmpty>No results found.</CommandEmpty> : null}
            {groups.map((group) => {
              const items = results.filter((result) => result.group === group)
              if (!items.length) return null
              return (
                <CommandGroup key={group} heading={group}>
                  {items.map((result) => (
                    <CommandItem
                      key={result.id}
                      value={`${result.label} ${result.detail}`}
                      onSelect={() => go(result)}
                      className="border-l-2 border-transparent data-[selected=true]:border-parchment data-[selected=true]:bg-parchment/15 data-[selected=true]:text-bone data-[selected=true]:[&_.result-detail]:text-dim"
                    >
                      <ChevronRight className="size-4 opacity-0 group-data-[selected=true]/command-item:opacity-100" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold uppercase">{result.label}</span>
                        <span className="result-detail block truncate text-xs text-dim">{result.detail}</span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
          </CommandList>
          <div className="flex items-center justify-end gap-3 border-t border-edge px-3 py-2 text-[0.625rem] text-dim" aria-hidden>
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
    </>
  )
}
