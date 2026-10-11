import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Boxes, EllipsisVertical, Heart, ListFilter, Plus, type LucideIcon } from 'lucide-react'
import { Fragment, memo, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { FormatRuleId } from '../../../../core/battle'
import { enforces, formatRules } from '../../../../core/battle'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { pickerRelationships } from '../../../../core/pickerRelationships'
import type { AttachableUnit } from '../../../../core/attachmentOptions'
import type { KeyedPick } from '../rosterPicks'
import type { UnitSummary } from '../../../../contracts/catalogue'
import { SearchField } from '../../../components/SearchField'
import { DatasheetMatchReasons } from '../../../components/DatasheetMatchReasons'
import { useFavouriteDatasheets } from '../../../favouriteDatasheets'
import { searchDatasheetEntries } from '../../../../core/datasheetSearch'
import { collectionQuery, meQuery, unitsQuery } from '../../../queries'
import { shortName } from './factions'
import { GROUPS } from '../../../unitGroups'
import { Section } from './Section'
import { canAddCopy, unitLimitMessage } from './usePicks'

type Props = {
  enabled: boolean
  catalogueId: string
  onAdd: (entryId: string) => void
  onPreview: (entryId: string, name: string) => void
  picks: readonly KeyedPick[]
  rosterUnits: readonly (AttachableUnit | undefined)[]
  inRoster: Record<string, number>
  limits: ReadonlyMap<string, number | null>
  room: number | null
  battleSize: number
  /** Which of the battle size's restrictions the roster has switched off. */
  waivedRules: readonly FormatRuleId[]
  onWaiveToggle: (rule: FormatRuleId) => void
  query: string
  onQueryChange: (query: string) => void
  active: ReadonlySet<PickerFilter>
  onFilterToggle: (filter: PickerFilter) => void
}

export type PickerFilter = 'fit' | 'limit' | 'owned' | 'favourite'

/** Account filters are icons, matching the row hearts and the Collection page, so the row fits a phone. */
const FILTERS: { id: PickerFilter; label: string; hint: string; icon?: LucideIcon }[] = [
  { id: 'fit', label: 'Points fit', hint: 'Hide anything that would not fit in the points left' },
  { id: 'limit', label: 'Unit limit', hint: 'Hide anything the roster already holds as many of as it may' },
  { id: 'favourite', label: 'Favourites', hint: 'Show only your favourite datasheets', icon: Heart },
  { id: 'owned', label: 'Owned', hint: 'Show only datasheets in your collection', icon: Boxes },
]

/** Why an account filter cannot narrow anything yet. */
const EMPTY_FILTER: Partial<Record<PickerFilter, string>> = {
  owned: 'Nothing is in your collection yet. Add the datasheets you own on the Collection page.',
  favourite: 'You have no favourite datasheets yet. Press the heart beside a datasheet to make it one.',
}

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
  picks,
  rosterUnits,
  inRoster,
  limits,
  room,
  battleSize,
  waivedRules,
  onWaiveToggle,
  query,
  onQueryChange,
  active,
  onFilterToggle,
}: Props) {
  const unitsResult = useQuery({
    ...unitsQuery(catalogueId, battleSize, waivedRules),
    enabled: enabled && Boolean(catalogueId),
    placeholderData: keepPreviousData,
  })
  // Collections and favourites belong to an account, so a visitor's picker has none to mark or filter by.
  const { data: me } = useQuery(meQuery())
  const signedIn = Boolean(me)
  const collectionResult = useQuery({ ...collectionQuery(), enabled: enabled && signedIn })
  const [relationship, setRelationship] = useState('all')
  const relationshipChoices = picks.flatMap((pick, index) => {
    const unit = rosterUnits[index]
    return unit
      ? [
          { value: `leaders:${pick.key}`, label: `Leaders for ${unit.name} (${index + 1})` },
          ...(unit.attachment?.kind === 'leader'
            ? [{ value: `bodyguards:${pick.key}`, label: `Bodyguards for ${unit.name} (${index + 1})` }]
            : []),
        ]
      : []
  })
  const chosenRelationship = relationshipChoices.some((choice) => choice.value === relationship) ? relationship : 'all'
  const related = useMemo(() => {
    if (chosenRelationship === 'all') return unitsResult.data ?? []
    const [kind, key] = chosenRelationship.split(':')
    return pickerRelationships(unitsResult.data ?? [], picks, rosterUnits, { kind: kind as 'leaders' | 'bodyguards', key: Number(key) })
  }, [chosenRelationship, unitsResult.data, picks, rosterUnits])
  const found = useMemo(() => searchDatasheetEntries(related, query, (unit) => unit.search), [related, query])
  const owned = collectionResult.data
  const { favourites, loading: favouritesLoading, toggleFavourite, pending: favouriting } = useFavouriteDatasheets(enabled && signedIn)

  const collection = useMemo(() => new Set(owned ?? []), [owned])
  const shown = useMemo(
    () =>
      (found ?? []).filter((unit) => {
        if (active.has('fit') && room !== null && unit.points !== null && unit.points > room) return false
        if (active.has('limit') && limits.has(unit.id) && !canAddCopy(unit.id, inRoster[unit.id] ?? 0, limits)) return false
        if (active.has('owned') && collection.size && !collection.has(unit.id)) return false
        if (active.has('favourite') && favourites.size && !favourites.has(unit.id)) return false
        return true
      }),
    [found, active, room, inRoster, collection, favourites, limits],
  )
  const rules = formatRules(battleSize)
  const waived = rules.filter((rule) => !enforces(waivedRules, rule.id))
  const alliedFactions = useMemo(() => [...new Set(shown.flatMap((unit) => (unit.alliedFaction ? [unit.alliedFaction] : [])))], [shown])
  const sections = [
    ...GROUPS.map((group) => ({ ...group, alliedFaction: null })),
    ...alliedFactions.map((alliedFaction) => ({ id: `allied-${alliedFaction}`, plural: shortName(alliedFaction), alliedFaction })),
  ]

  return (
    <div data-onboarding="roster-picker" className="flex h-full flex-col">
      <div className="space-y-2 border-b border-edge p-2.5">
        <SearchField
          onboarding="picker-search"
          value={query}
          onChange={onQueryChange}
          placeholder="Search units, keywords, abilities…"
          label="Add a unit"
          clearLabel="Empty the picker filter"
          maxLength={80}
          inputClassName="h-9"
        />
        {relationshipChoices.length ? (
          <Select value={chosenRelationship} onValueChange={(value) => setRelationship(value ?? 'all')}>
            <SelectTrigger aria-label="Unit relationships" className="h-11 w-full min-w-0 text-xs">
              <SelectValue>
                {chosenRelationship === 'all'
                  ? 'All units'
                  : relationshipChoices.find((choice) => choice.value === chosenRelationship)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="min-h-11">
                All units
              </SelectItem>
              {relationshipChoices.map((choice) => (
                <SelectItem key={choice.value} value={choice.value} className="min-h-11 text-xs">
                  {choice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5">
          <ListFilter className="size-3.5 shrink-0 text-faint" aria-hidden />
          {FILTERS.filter((filter) => signedIn || !filter.icon).map((filter) => (
            <FilterChip
              key={filter.id}
              {...filter}
              pressed={active.has(filter.id)}
              onToggle={() => onFilterToggle(filter.id)}
              unavailable={
                (filter.id === 'owned' && !collection.size) || (filter.id === 'favourite' && !favourites.size)
                  ? EMPTY_FILTER[filter.id]
                  : undefined
              }
            />
          ))}
          {/*
           * The restrictions the battle size imposes, switched off over the book they
           * act on: unchecking one is what puts the datasheets it was hiding back in
           * this list. What a list has switched off is said again under the roster,
           * where the errors it is no longer being told about would have been.
           */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Format restrictions"
                  className={`ml-auto shrink-0 ${waived.length ? 'text-discarded' : 'text-faint hover:text-bone'}`}
                />
              }
            >
              <EllipsisVertical />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-[min(20rem,calc(100vw-2rem))] min-w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="eyebrow text-faint">Format restrictions</DropdownMenuLabel>
                {rules.length ? (
                  rules.map((rule) => (
                    <DropdownMenuCheckboxItem
                      key={rule.id}
                      className="items-start py-1.5"
                      checked={enforces(waivedRules, rule.id)}
                      onCheckedChange={() => onWaiveToggle(rule.id)}
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold uppercase">{rule.label}</span>
                        <span className="mt-0.5 block text-2xs leading-tight text-wrap text-dim">{rule.hint}</span>
                      </span>
                    </DropdownMenuCheckboxItem>
                  ))
                ) : (
                  <DropdownMenuItem disabled className="text-xs">
                    This battle size adds no restrictions.
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]]:px-2.5">
        {unitsResult.isPending || (signedIn && (collectionResult.isPending || favouritesLoading)) ? (
          <PickerSkeleton />
        ) : unitsResult.isError ? (
          <p className="py-3 text-xs text-destructive">The book could not be loaded.</p>
        ) : shown.length ? (
          sections.map(({ id, plural, alliedFaction }) => {
            const rows = shown
              .filter((unit) => (alliedFaction ? unit.alliedFaction === alliedFaction : !unit.allied && unit.group === id))
              .toSorted((left, right) => Number(favourites.has(right.id)) - Number(favourites.has(left.id)))
            return rows.length ? (
              <Fragment key={id}>
                {alliedFaction === alliedFactions[0] ? <h2 className="rubric pt-1.5">Allied units</h2> : null}
                <Section title={plural} count={rows.length} defaultOpen={!alliedFaction}>
                  {rows.map((unit) => {
                    const held = inRoster[unit.id] ?? 0
                    const full = !canAddCopy(unit.id, held, limits)
                    return (
                      <PickerRow
                        key={unit.id}
                        unit={{ ...unit, limit: limits.has(unit.id) ? limits.get(unit.id)! : unit.limit }}
                        unavailableReason={limits.get(unit.id) === 0 ? unitLimitMessage(unit.id, held, limits) : null}
                        relationship={'relationship' in unit ? String(unit.relationship) : null}
                        attachmentReason={'attachmentReason' in unit ? (unit.attachmentReason as string | null) : null}
                        held={held}
                        full={full}
                        favourite={favourites.has(unit.id)}
                        favouritePending={favouriting.isPending && favouriting.variables?.entryId === unit.id}
                        query={query}
                        onPreview={onPreview}
                        onFavourite={signedIn ? toggleFavourite : undefined}
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
            {found?.length
              ? 'Everything is filtered out.'
              : chosenRelationship !== 'all'
                ? 'No matching relationships in this rules version.'
                : query
                  ? 'No matching units.'
                  : 'No units available.'}
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
          <Skeleton className="h-7 w-14 shrink-0" />
        </div>
      ))}
    </div>
  )
}

type PickerRowProps = {
  unit: UnitSummary
  held: number
  full: boolean
  favourite: boolean
  favouritePending: boolean
  query: string
  relationship: string | null
  attachmentReason: string | null
  unavailableReason: string | null
  onPreview: (entryId: string, name: string) => void
  onFavourite?: (entryId: string) => void
  onAdd: (entryId: string) => void
}

const PickerRow = memo(function PickerRow({
  unit,
  held,
  full,
  favourite,
  favouritePending,
  query,
  relationship,
  attachmentReason,
  unavailableReason,
  onPreview,
  onFavourite,
  onAdd,
}: PickerRowProps) {
  return (
    <div
      data-onboarding="picker-unit"
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
          <span className="block text-sm leading-tight font-semibold tracking-wide uppercase">{unit.name}</span>
          <DatasheetMatchReasons query={query} reasons={unit.matchReasons} />
          {relationship ? <span className="mt-1 block text-2xs font-normal normal-case text-dim">{relationship}</span> : null}
          {attachmentReason ? (
            <span className="mt-1 block text-2xs font-normal normal-case text-discarded">
              {attachmentReason}
              {full ? '' : ' Can be added separately.'}
            </span>
          ) : null}
          {unavailableReason ? (
            <span className="mt-1 block text-2xs font-normal normal-case text-discarded">{unavailableReason}</span>
          ) : null}
          {held ? (
            <span className={`readout block text-2xs ${full ? 'text-discarded' : 'text-faint'}`}>
              {held}
              {unit.limit === null ? '' : `/${unit.limit}`} in roster
            </span>
          ) : null}
        </span>
      </button>
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {onFavourite ? (
          <Toggle
            variant="default"
            size="sm"
            aria-label={`${favourite ? 'Remove' : 'Add'} ${unit.name} ${favourite ? 'from' : 'to'} favourite datasheets`}
            pressed={favourite}
            disabled={favouritePending}
            onPressedChange={() => onFavourite(unit.id)}
            className="size-6 shrink-0 p-0"
          >
            <Heart className={`size-3.5 ${favourite ? 'fill-rust text-rust' : 'text-faint hover:text-dim'}`} />
          </Toggle>
        ) : null}
        {unit.points === null ? null : <span className="chip w-[4.5rem] shrink-0 justify-center text-info">{unit.points} pts</span>}
        <Button
          data-onboarding="picker-add"
          size="sm"
          className="shrink-0 px-2"
          aria-label={`Add ${unit.name}`}
          disabled={full}
          onClick={() => onAdd(unit.id)}
        >
          <Plus className="size-3" />
          Add
        </Button>
      </span>
    </div>
  )
})

/** Unavailable filters stay focusable and open their tooltip on a tap, so a phone can still say why. */
function FilterChip({
  label,
  hint,
  icon: Icon,
  pressed,
  onToggle,
  unavailable,
}: {
  label: string
  hint: string
  icon?: LucideIcon
  pressed: boolean
  onToggle: () => void
  unavailable?: string
}) {
  const [open, setOpen] = useState(false)
  const chip = 'rounded-sm border px-1.5 py-px text-2xs font-semibold tracking-label uppercase transition-colors'
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        closeOnClick={!unavailable}
        render={
          unavailable ? (
            <button
              type="button"
              aria-disabled="true"
              aria-label={label}
              onClick={() => setOpen(true)}
              className={`${chip} inline-flex h-7 min-w-7 cursor-not-allowed items-center justify-center border-edge text-faint`}
            />
          ) : (
            <Toggle
              variant="outline"
              size="sm"
              aria-label={Icon ? label : undefined}
              pressed={pressed}
              onPressedChange={onToggle}
              className={`${chip} ${
                pressed ? 'border-parchment bg-parchment/15 text-parchment' : 'border-edge-strong text-dim hover:border-dim hover:text-bone'
              }`}
            />
          )
        }
      >
        {Icon ? <Icon className={`size-3.5 ${pressed && Icon === Heart ? 'fill-current' : ''}`} /> : label}
      </TooltipTrigger>
      <TooltipContent role="tooltip" side="bottom" className="max-w-60 text-xs">
        {unavailable ?? hint}
      </TooltipContent>
    </Tooltip>
  )
}
