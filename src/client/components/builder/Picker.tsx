import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Heart, ListFilter, Plus } from 'lucide-react'
import { Fragment, memo, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Toggle } from '@/components/ui/toggle'
import { isKotcLimit } from '../../../core/battle'
import type { UnitSummary } from '../../../server/cataloguePicker'
import { SearchField } from '../SearchField'
import { DatasheetMatchReasons } from '../DatasheetMatchReasons'
import { useCollectionMutation } from '../../useCollection'
import { useSettled } from '../../useSettled'
import { collectionQuery, unitsQuery } from '../../queries'
import { shortName } from './factions'
import { GROUPS } from './groups'
import { Section } from './Section'

type Props = {
  enabled: boolean
  catalogueId: string
  onAdd: (entryId: string) => void
  onPreview: (entryId: string, name: string) => void
  inRoster: Record<string, number>
  room: number | null
  battleSize: number
  query: string
  onQueryChange: (query: string) => void
  active: ReadonlySet<PickerFilter>
  onFilterToggle: (filter: PickerFilter) => void
}

export type PickerFilter = 'fit' | 'limit' | 'owned' | 'allies'

const FILTERS: { id: PickerFilter; label: string; hint: string }[] = [
  { id: 'fit', label: 'Points fit', hint: 'Hide anything that would not fit in the points left' },
  { id: 'limit', label: 'Unit limit', hint: 'Hide anything the roster already holds as many of as it may' },
  { id: 'owned', label: 'Owned', hint: 'Show only datasheets you own models for' },
  { id: 'allies', label: 'Hide allies', hint: 'Hide allied datasheets contributed by secondary forces' },
]

/**
 * The book, to pick from.
 *
 * Every row states what it costs before it is taken and how many of it the roster
 * already holds, because both are the questions being asked at this point. The
 * filters narrow by the reasons a datasheet is not a real option today: it does not
 * fit, you may not take another, or you do not own it.
 */
export const Picker = memo(function Picker({
  enabled,
  catalogueId,
  onAdd,
  onPreview,
  inRoster,
  room,
  battleSize,
  query,
  onQueryChange,
  active,
  onFilterToggle,
}: Props) {
  const settledQuery = useSettled(query.trim())
  const unitsResult = useQuery({
    ...unitsQuery(catalogueId, settledQuery, battleSize),
    enabled: enabled && Boolean(catalogueId),
    placeholderData: keepPreviousData,
  })
  const collectionResult = useQuery({ ...collectionQuery(), enabled })
  const found = unitsResult.data
  const owned = collectionResult.data
  const own = useCollectionMutation()
  const { mutate: mutateCollection } = own
  const setOwned = useCallback((entryId: string, nextOwned: boolean) => mutateCollection({ entryId, owned: nextOwned }), [mutateCollection])

  const collection = useMemo(() => new Set(owned ?? []), [owned])
  const shown = useMemo(
    () =>
      (found ?? []).filter((unit) => {
        if (active.has('fit') && room !== null && unit.points !== null && unit.points > room) return false
        if (active.has('limit') && unit.limit !== null && (inRoster[unit.id] ?? 0) >= unit.limit) return false
        if (active.has('owned') && !collection.has(unit.id)) return false
        if (active.has('allies') && unit.allied) return false
        return true
      }),
    [found, active, room, inRoster, collection],
  )
  const alliedFactions = useMemo(() => [...new Set(shown.flatMap((unit) => (unit.alliedFaction ? [unit.alliedFaction] : [])))], [shown])
  const sections = [
    ...GROUPS.map((group) => ({ ...group, alliedFaction: null })),
    ...alliedFactions.map((alliedFaction) => ({ id: `allied-${alliedFaction}`, plural: shortName(alliedFaction), alliedFaction })),
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-edge p-2.5">
        <SearchField
          value={query}
          onChange={onQueryChange}
          placeholder="Search units, keywords, abilities…"
          label="Add a unit"
          clearLabel="Empty the picker filter"
          inputClassName="h-9"
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
              onPressedChange={() => onFilterToggle(filter.id)}
              className={`rounded-sm border px-1.5 py-px text-[0.6875rem] font-semibold tracking-[0.06em] uppercase transition-colors ${
                active.has(filter.id)
                  ? 'border-parchment bg-parchment/15 text-parchment'
                  : 'border-edge-strong text-dim hover:border-dim hover:text-bone'
              }`}
            >
              {filter.label}
            </Toggle>
          ))}
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]]:px-2.5">
        {unitsResult.isPending || collectionResult.isPending ? (
          <PickerSkeleton />
        ) : unitsResult.isError ? (
          <p className="py-3 text-xs text-destructive">The book could not be loaded.</p>
        ) : shown.length ? (
          sections.map(({ id, plural, alliedFaction }) => {
            const rows = shown
              .filter((unit) => (alliedFaction ? unit.alliedFaction === alliedFaction : !unit.allied && unit.group === id))
              .toSorted((left, right) => Number(collection.has(right.id)) - Number(collection.has(left.id)))
            return rows.length ? (
              <Fragment key={id}>
                {alliedFaction === alliedFactions[0] ? <h2 className="rubric pt-1.5">Allied units</h2> : null}
                <Section title={plural} count={rows.length} defaultOpen={!alliedFaction}>
                  {rows.map((unit) => {
                    const held = inRoster[unit.id] ?? 0
                    const full = unit.limit !== null && held >= unit.limit
                    return (
                      <PickerRow
                        key={unit.id}
                        unit={unit}
                        held={held}
                        full={full}
                        inCollection={collection.has(unit.id)}
                        collectionPending={own.isPending && own.variables?.entryId === unit.id}
                        battleSize={battleSize}
                        query={settledQuery}
                        onPreview={onPreview}
                        onOwned={setOwned}
                        onAdd={onAdd}
                      />
                    )
                  })}
                </Section>
              </Fragment>
            ) : null
          })
        ) : (
          <p className="py-3 text-xs text-faint">
            {found?.length ? 'Everything is filtered out.' : query ? 'No matching units.' : 'Loading the book…'}
          </p>
        )}
      </ScrollArea>
    </div>
  )
})

function PickerSkeleton() {
  return (
    <div className="space-y-2 py-2" aria-label="Loading units">
      <Skeleton className="h-3 w-20" />
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex h-[3.25rem] items-center gap-2 border border-edge bg-card px-2.5" aria-hidden>
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="size-6 shrink-0" />
          <Skeleton className="h-5 w-[4.5rem] shrink-0" />
          <Skeleton className="h-7 w-14 shrink-0 rounded-none" />
        </div>
      ))}
    </div>
  )
}

type PickerRowProps = {
  unit: UnitSummary
  held: number
  full: boolean
  inCollection: boolean
  collectionPending: boolean
  battleSize: number
  query: string
  onPreview: (entryId: string, name: string) => void
  onOwned: (entryId: string, owned: boolean) => void
  onAdd: (entryId: string) => void
}

const PickerRow = memo(function PickerRow({
  unit,
  held,
  full,
  inCollection,
  collectionPending,
  battleSize,
  query,
  onPreview,
  onOwned,
  onAdd,
}: PickerRowProps) {
  return (
    <div
      data-picker-unit={unit.name}
      className="flex items-center gap-1.5 border border-edge bg-card px-2.5 py-1.5 [contain:layout_style] [contain-intrinsic-size:auto_3.25rem] [content-visibility:auto]"
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left hover:text-info"
        aria-label={`View ${unit.name} datasheet`}
        onClick={() => onPreview(unit.id, unit.name)}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-tight font-semibold tracking-[0.02em] uppercase">{unit.name}</span>
          <DatasheetMatchReasons query={query} reasons={unit.matchReasons} />
          {held ? (
            <span className={`readout block text-[0.6875rem] ${full ? 'text-discarded' : 'text-faint'}`}>
              {held}
              {unit.limit === null ? '' : `/${unit.limit}`} in roster
            </span>
          ) : null}
        </span>
      </button>
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        <Toggle
          variant="default"
          size="sm"
          aria-label={`${inCollection ? 'Remove' : 'Add'} ${unit.name} ${inCollection ? 'from' : 'to'} your collection`}
          pressed={inCollection}
          disabled={collectionPending}
          onPressedChange={(pressed) => onOwned(unit.id, pressed)}
          className="size-6 shrink-0 p-0"
        >
          <Heart className={`size-3.5 ${inCollection ? 'fill-rust text-rust' : 'text-faint hover:text-dim'}`} />
        </Toggle>
        {unit.points === null ? null : <span className="chip w-[4.5rem] shrink-0 justify-center text-info">{unit.points} pts</span>}
        <Button
          size="sm"
          className="h-7 shrink-0 px-2 text-[0.6875rem]"
          aria-label={`Add ${unit.name}`}
          disabled={isKotcLimit(battleSize) && full}
          onClick={() => onAdd(unit.id)}
        >
          <Plus className="size-3" />
          Add
        </Button>
      </span>
    </div>
  )
})
