import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Heart, ListFilter, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Toggle } from '@/components/ui/toggle'
import { useCollectionMutation } from '../../useCollection'
import { collectionQuery, unitsQuery } from '../../queries'
import { GROUPS } from './groups'
import { Section } from './Section'

type Props = {
  catalogueId: string
  onAdd: (entryId: string) => void
  onPreview: (entryId: string) => void
  inRoster: Record<string, number>
  room: number | null
}

type Filter = 'fit' | 'limit' | 'owned'

const FILTERS: { id: Filter; label: string; hint: string }[] = [
  { id: 'fit', label: 'Points fit', hint: 'Hide anything that would not fit in the points left' },
  { id: 'limit', label: 'Unit limit', hint: 'Hide anything the roster already holds as many of as it may' },
  { id: 'owned', label: 'Owned', hint: 'Show only datasheets you own models for' },
]

/**
 * The book, to pick from.
 *
 * Every row states what it costs before it is taken and how many of it the roster
 * already holds, because both are the questions being asked at this point. The
 * filters narrow by the reasons a datasheet is not a real option today: it does not
 * fit, you may not take another, or you do not own it.
 */
export function Picker({ catalogueId, onAdd, onPreview, inRoster, room }: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<Set<Filter>>(new Set())
  const { data: found } = useQuery({ ...unitsQuery(catalogueId, query), placeholderData: keepPreviousData })
  const { data: owned } = useQuery(collectionQuery())
  const own = useCollectionMutation()

  const collection = new Set(owned ?? [])
  const toggle = (filter: Filter) =>
    setActive((current) => {
      const next = new Set(current)
      if (!next.delete(filter)) next.add(filter)
      return next
    })

  const shown = (found ?? [])
    .filter((unit) => {
      if (active.has('fit') && room !== null && unit.points !== null && unit.points > room) return false
      if (active.has('limit') && unit.limit !== null && (inRoster[unit.id] ?? 0) >= unit.limit) return false
      if (active.has('owned') && !collection.has(unit.id)) return false
      return true
    })
    .sort((left, right) => Number(collection.has(right.id)) - Number(collection.has(left.id)))

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
            <Toggle
              key={filter.id}
              variant="outline"
              size="sm"
              title={filter.hint}
              pressed={active.has(filter.id)}
              onPressedChange={() => toggle(filter.id)}
              className={`rounded-sm border px-1.5 py-px text-[0.6875rem] font-semibold tracking-[0.06em] uppercase transition-colors ${
                active.has(filter.id)
                  ? 'border-azure bg-azure/15 text-azure'
                  : 'border-edge-strong text-dim hover:border-dim hover:text-bone'
              }`}
            >
              {filter.label}
            </Toggle>
          ))}
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]]:px-2.5">
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
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left hover:text-azure"
                        aria-label={`View ${unit.name} datasheet`}
                        onClick={() => onPreview(unit.id)}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm leading-tight font-semibold tracking-[0.02em] uppercase">{unit.name}</span>
                          {held ? (
                            <span className={`readout block text-[0.6875rem] ${full ? 'text-discarded' : 'text-faint'}`}>
                              {held}
                              {unit.limit === null ? '' : `/${unit.limit}`} in roster
                            </span>
                          ) : null}
                        </span>
                      </button>
                      <Toggle
                        variant="default"
                        size="sm"
                        aria-label={`${collection.has(unit.id) ? 'Remove' : 'Add'} ${unit.name} ${collection.has(unit.id) ? 'from' : 'to'} your collection`}
                        pressed={collection.has(unit.id)}
                        disabled={own.isPending}
                        onPressedChange={(pressed) => own.mutate({ entryId: unit.id, owned: pressed })}
                        className="size-6 shrink-0 p-0"
                      >
                        <Heart className={`size-3.5 ${collection.has(unit.id) ? 'fill-azure text-azure' : 'text-faint hover:text-dim'}`} />
                      </Toggle>
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
      </ScrollArea>
    </div>
  )
}
