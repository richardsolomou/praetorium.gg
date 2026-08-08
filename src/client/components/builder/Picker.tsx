import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Heart, ListFilter, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { setOwned } from '../../../server/functions'
import { collectionQuery, unitsQuery } from '../../queries'
import { GROUPS } from './groups'
import { Section } from './Section'

type Props = { catalogueId: string; onAdd: (entryId: string) => void; inRoster: Record<string, number>; room: number | null }

type Filter = 'fit' | 'limit' | 'owned' | 'legends'

const FILTERS: { id: Filter; label: string; hint: string }[] = [
  { id: 'fit', label: 'Points fit', hint: 'Hide anything that would not fit in the points left' },
  { id: 'limit', label: 'Unit limit', hint: 'Hide anything the roster already holds as many of as it may' },
  { id: 'owned', label: 'Owned', hint: 'Show only datasheets you own models for' },
  { id: 'legends', label: 'Legends', hint: 'Also show the datasheets moved to Legends, which no tournament allows' },
]

/**
 * The book, to pick from.
 *
 * Every row states what it costs before it is taken and how many of it the roster
 * already holds, because both are the questions being asked at this point. The
 * filters narrow by the reasons a datasheet is not a real option today: it does not
 * fit, you may not take another, or you do not own it. Legends is the one that
 * widens rather than narrows, because a third of every book is Legends and none of
 * it can be played.
 */
export function Picker({ catalogueId, onAdd, inRoster, room }: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<Set<Filter>>(new Set())
  // Legends are left out of the book itself rather than of what is shown: the
  // server answers with a page of results, and Legends would eat it.
  const { data: found } = useQuery(unitsQuery(catalogueId, query, active.has('legends')))
  const { data: owned } = useQuery(collectionQuery())
  const queryClient = useQueryClient()

  const own = useMutation({
    mutationFn: (input: { entryId: string; owned: boolean }) => setOwned({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionQuery().queryKey }),
  })

  const collection = new Set(owned ?? [])
  const toggle = (filter: Filter) =>
    setActive((current) => {
      const next = new Set(current)
      if (!next.delete(filter)) next.add(filter)
      return next
    })

  const shown = (found ?? []).filter((unit) => {
    if (active.has('fit') && room !== null && unit.points !== null && unit.points > room) return false
    if (active.has('limit') && unit.limit !== null && (inRoster[unit.id] ?? 0) >= unit.limit) return false
    if (active.has('owned') && !collection.has(unit.id)) return false
    return true
  })

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-edge p-2.5">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type a datasheet name"
          aria-label="Add a unit"
          className="h-9"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <ListFilter className="size-3.5 shrink-0 text-faint" aria-hidden />
          {FILTERS.map((filter) => (
            <Button
              key={filter.id}
              variant="outline"
              size="xs"
              title={filter.hint}
              aria-pressed={active.has(filter.id)}
              onClick={() => toggle(filter.id)}
              className={`rounded-sm border px-1.5 py-px text-[0.6875rem] font-semibold tracking-[0.06em] uppercase transition-colors ${
                active.has(filter.id)
                  ? 'border-azure bg-azure/15 text-azure'
                  : 'border-edge-strong text-dim hover:border-dim hover:text-bone'
              }`}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5">
        {shown.length ? (
          GROUPS.map(({ id, plural }) => {
            const rows = shown.filter((unit) => unit.group === id)
            return rows.length ? (
              <Section key={id} title={plural} count={rows.length}>
                {rows.map((unit) => {
                  const held = inRoster[unit.id] ?? 0
                  const full = unit.limit !== null && held >= unit.limit
                  return (
                    <div key={unit.id} className="flex items-center gap-1.5 border border-edge bg-card px-2.5 py-1.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm leading-tight font-semibold tracking-[0.02em] uppercase">{unit.name}</span>
                        {held ? (
                          <span className={`readout block text-[0.6875rem] ${full ? 'text-discarded' : 'text-faint'}`}>
                            {held}
                            {unit.limit === null ? '' : `/${unit.limit}`} in roster
                          </span>
                        ) : null}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`${collection.has(unit.id) ? 'Remove' : 'Add'} ${unit.name} ${collection.has(unit.id) ? 'from' : 'to'} your collection`}
                        aria-pressed={collection.has(unit.id)}
                        disabled={own.isPending}
                        onClick={() => own.mutate({ entryId: unit.id, owned: !collection.has(unit.id) })}
                        className="shrink-0"
                      >
                        <Heart className={`size-3.5 ${collection.has(unit.id) ? 'fill-azure text-azure' : 'text-faint hover:text-dim'}`} />
                      </Button>
                      {unit.points === null ? null : <span className="chip shrink-0">{unit.points} pts</span>}
                      <Button
                        size="sm"
                        className="h-7 shrink-0 px-2 text-[0.6875rem]"
                        aria-label={`Add ${unit.name}`}
                        onClick={() => onAdd(unit.id)}
                      >
                        <Plus className="size-3" />
                        Add
                      </Button>
                    </div>
                  )
                })}
              </Section>
            ) : null
          })
        ) : (
          <p className="py-3 text-xs text-faint">
            {found?.length ? 'Everything is filtered out.' : query ? 'Nothing by that name.' : 'Loading the book…'}
          </p>
        )}
      </div>
    </div>
  )
}
