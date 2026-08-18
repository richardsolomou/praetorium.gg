import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import type { GlobalSearchResult } from '../../server/functions'
import { globalSearchQuery } from '../queries'
import { isSearchShortcut } from './globalSearchShortcut'

const pages: GlobalSearchResult[] = [
  { id: 'page:battles', group: 'Your battles', label: 'Battles', detail: 'Your current and finished games', href: '/battles' },
  { id: 'page:rosters', group: 'Your rosters', label: 'Rosters', detail: 'Build and manage army lists', href: '/rosters' },
  { id: 'page:factions', group: 'Factions', label: 'Factions', detail: 'Datasheets and detachment references', href: '/factions' },
  { id: 'page:missions', group: 'Missions', label: 'Mission packs', detail: 'Missions, scoring and deployments', href: '/mission-packs' },
]

const groups: GlobalSearchResult['group'][] = ['Factions', 'Datasheets', 'Detachments', 'Missions', 'Your rosters', 'Your battles']

export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const trimmed = query.trim()
  const { data = [], isFetching } = useQuery({ ...globalSearchQuery(trimmed), placeholderData: keepPreviousData })
  const results = trimmed ? data : pages

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isSearchShortcut(event)) return
      event.preventDefault()
      setOpen((current) => !current)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const go = (href: string) => {
    setOpen(false)
    setQuery('')
    window.location.assign(href)
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
        <kbd className="hidden text-[0.625rem] text-faint sm:inline">⌘K</kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setQuery('')
        }}
        title="Search Praetorium"
        description="Search pages, factions, datasheets, detachments, missions, rosters and battles."
        className="top-[15vh] max-w-xl translate-y-0 rounded-none! border border-edge bg-panel"
      >
        <Command>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search everything…" />
          <CommandList className="max-h-[min(60vh,30rem)]">
            {trimmed.length === 1 ? <p className="py-6 text-center text-sm text-dim">Type one more character.</p> : null}
            {trimmed.length >= 2 && isFetching ? <p className="py-6 text-center text-sm text-dim">Searching…</p> : null}
            {trimmed.length >= 2 && !isFetching ? <CommandEmpty>No results found.</CommandEmpty> : null}
            {groups.map((group) => {
              const items = results.filter((result) => result.group === group)
              if (!items.length) return null
              return (
                <CommandGroup key={group} heading={group}>
                  {items.map((result) => (
                    <CommandItem key={result.id} value={`${result.label} ${result.detail}`} onSelect={() => go(result.href)}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold uppercase">{result.label}</span>
                        <span className="block truncate text-xs text-dim">{result.detail}</span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
