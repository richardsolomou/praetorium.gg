import { useQuery } from '@tanstack/react-query'
import { EllipsisVertical, Heart, Plus, type LucideIcon } from 'lucide-react'
import { Fragment, memo, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Toggle } from '@/components/ui/toggle'
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
import type { UnitSummary } from '../../../../contracts/catalogue'
import type { NonMatchedPlayKind } from '../../../../core/name'
import type { RosterPick } from '../../../../core/roster'
import { SearchField } from '../../../components/SearchField'
import { ACCOUNT_FILTERS, type AccountFilter, FilterChip } from '../../../components/FilterChip'
import { DatasheetMatchReasons } from '../../../components/DatasheetMatchReasons'
import { useFavouriteDatasheets } from '../../../favouriteDatasheets'
import { searchDatasheetEntries } from '../../../../core/datasheetSearch'
import { collectionCountsAsQuery, collectionQuery, meQuery, unitsQuery } from '../../../queries'
import { usableDatasheets } from '../../../../core/collection'
import { shortName } from './factions'
import { GROUPS } from '../../../unitGroups'
import { Section } from './Section'
import { batchFits, canAddCopy, requestedUnit, unitLimitMessage } from './usePicks'
import { Problem } from '../../../components/Problem'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { loadoutPicks } from '../../../../core/rosterCopies'
import type { priceQuery } from '../../../queries'
import { LoadoutNameDialog } from './LoadoutNameDialog'
import { LoadoutRow } from './LoadoutRow'
import { isAttachedUnit, loadoutNoun, type PickerLoadout, pickerRows, shownKind } from './pickerRows'
import { useUnitLoadouts } from './useUnitLoadouts'
import { PointsChip } from './PointsChip'

type Props = {
  enabled: boolean
  catalogueId: string
  detachmentIds: readonly string[]
  onAdd: (entryId: string) => void
  onApplyLoadout: (picks: readonly RosterPick[]) => void
  /** The roster's own price request for other units, so a saved loadout shows what it would cost here. */
  priceLoadouts: (picks: readonly RosterPick[]) => ReturnType<typeof priceQuery>
  onPreview: (entryId: string, name: string) => void
  inRoster: Record<string, number>
  limits: ReadonlyMap<string, number | null>
  room: number | null
  battleSize: number
  pointsBudget: number | null
  /** Which of the battle size's restrictions the roster has switched off. */
  waivedRules: readonly FormatRuleId[]
  onWaiveToggle: (rule: FormatRuleId) => void
  query: string
  onQueryChange: (query: string) => void
  active: ReadonlySet<PickerFilter>
  onFilterToggle: (filter: PickerFilter) => void
}

export type PickerFilter = 'fit' | 'limit' | AccountFilter | NonMatchedPlayKind

const FILTERS: { id: PickerFilter; label: string; hint: string; icon?: LucideIcon; empty?: string }[] = [
  { id: 'fit', label: 'Points fit', hint: 'Hide anything that would not fit in the points left' },
  { id: 'limit', label: 'Unit limit', hint: 'Hide anything the roster already holds as many of as it may' },
  ...ACCOUNT_FILTERS,
  { id: 'legends', label: 'Legends', hint: 'Show Legends datasheets' },
  { id: 'crucible', label: 'Crucible', hint: 'Show Crucible datasheets' },
]

/**
 * The book, to pick from.
 *
 * Every row states what it costs before it is taken and how many of it the roster
 * already holds, because both are the questions being asked at this point. The
 * filters narrow by the reasons a datasheet is not a real option today: it does not
 * fit, you may not take another, or you do not own it. Legends and Crucible are the
 * exception, hidden until asked for, because most lists never want them.
 */
export const Picker = memo(function Picker({
  enabled,
  catalogueId,
  detachmentIds,
  onAdd,
  onApplyLoadout,
  priceLoadouts,
  onPreview,
  inRoster,
  limits,
  room,
  battleSize,
  pointsBudget,
  waivedRules,
  onWaiveToggle,
  query,
  onQueryChange,
  active,
  onFilterToggle,
}: Props) {
  const unitsResult = useQuery({
    ...unitsQuery(catalogueId, battleSize, waivedRules, detachmentIds),
    enabled: enabled && Boolean(catalogueId),
  })
  // Collections and favourites belong to an account, so a visitor's picker has none to mark or filter by.
  const { data: me } = useQuery(meQuery())
  const signedIn = Boolean(me)
  const collectionResult = useQuery({ ...collectionQuery(), enabled: enabled && signedIn })
  const countsAsResult = useQuery({ ...collectionCountsAsQuery(), enabled: enabled && signedIn })
  const found = useMemo(() => searchDatasheetEntries(unitsResult.data ?? [], query, (unit) => unit.search), [unitsResult.data, query])
  const owned = collectionResult.data
  const countsAs = countsAsResult.data
  const { favourites, loading: favouritesLoading, toggleFavourite, pending: favouriting } = useFavouriteDatasheets(enabled && signedIn)

  const { loadouts: savedLoadouts, rename, remove } = useUnitLoadouts(enabled && signedIn)
  const [renaming, setRenaming] = useState<PickerLoadout | null>(null)
  const [deleting, setDeleting] = useState<PickerLoadout | null>(null)
  const offered = useMemo(() => new Set((unitsResult.data ?? []).map((unit) => unit.id)), [unitsResult.data])
  const datasheetNames = useMemo(() => new Map((unitsResult.data ?? []).map((unit) => [unit.id, unit.name])), [unitsResult.data])
  const nonMatchedPlay = useMemo(
    () => new Map((unitsResult.data ?? []).flatMap((unit) => (unit.nonMatchedPlay ? [[unit.id, unit.nonMatchedPlay] as const] : []))),
    [unitsResult.data],
  )
  const fits = (picks: readonly RosterPick[]) => batchFits(picks, inRoster, limits)
  const applicable = useMemo(
    () =>
      (savedLoadouts.data ?? []).flatMap((loadout) => {
        const [pick, ...joined] = loadoutPicks(loadout, catalogueId) ?? []
        return pick ? [{ id: loadout.id, name: loadout.name, picks: [pick, ...joined] as const }] : []
      }),
    [savedLoadouts.data, catalogueId],
  )
  const priceable = useMemo(
    () => applicable.filter((loadout) => loadout.picks.every((pick) => offered.has(pick.entryId))),
    [applicable, offered],
  )
  // Priced as separate units, so one loadout's attachments cannot be checked against another's.
  const pricedPicks = useMemo(
    () => priceable.flatMap((loadout) => loadout.picks.map(({ attachedTo: _attachedTo, ...pick }) => pick)),
    [priceable],
  )
  const loadoutPrices = useQuery({ ...priceLoadouts(pricedPicks), enabled: enabled && priceable.length > 0 })
  const loadouts = useMemo<PickerLoadout[]>(() => {
    const units = loadoutPrices.data?.units
    let next = 0
    const points = new Map(
      priceable.map((loadout) => {
        const keys = loadout.picks.map(() => next++)
        const prices = keys.map((key) => units?.find((unit) => unit.key === key)?.points)
        return [loadout, prices.some((price) => price == null) ? undefined : prices.reduce((sum: number, price) => sum + (price ?? 0), 0)]
      }),
    )
    return applicable.map((loadout) => ({
      ...loadout,
      points: !points.has(loadout) || loadoutPrices.isError ? null : loadoutPrices.data ? (points.get(loadout) ?? null) : undefined,
    }))
  }, [applicable, priceable, loadoutPrices.data, loadoutPrices.isError])

  const collection = useMemo(() => usableDatasheets(owned ?? [], countsAs ?? {}), [owned, countsAs])
  const rows = useMemo(
    () =>
      pickerRows({
        units: unitsResult.data ?? [],
        found,
        loadouts,
        query,
        keeps: (entryId, points) => {
          if (!shownKind(nonMatchedPlay.get(entryId), active)) return false
          if (active.has('fit') && room !== null && points != null && points > room) return false
          if (active.has('limit') && limits.has(entryId) && !canAddCopy(entryId, inRoster[entryId] ?? 0, limits)) return false
          if (active.has('owned') && collection.size && !collection.has(entryId)) return false
          if (active.has('favourite') && favourites.size && !favourites.has(entryId)) return false
          return true
        },
      }),
    [unitsResult.data, found, loadouts, query, active, room, inRoster, collection, favourites, limits, nonMatchedPlay],
  )
  const shown = rows.units
  const rules = formatRules(battleSize, pointsBudget)
  const waived = rules.filter((rule) => !enforces(waivedRules, rule.id))
  const alliedFactions = useMemo(() => [...new Set(shown.flatMap((unit) => (unit.alliedFaction ? [unit.alliedFaction] : [])))], [shown])
  const sections = [
    ...GROUPS.map((group) => ({ ...group, alliedFaction: null })),
    ...alliedFactions.map((alliedFaction) => ({ id: `allied-${alliedFaction}`, plural: shortName(alliedFaction), alliedFaction })),
  ]

  return (
    <div data-onboarding="roster-picker" className="flex h-full flex-col">
      <div className="space-y-2 border-b border-edge p-2.5">
        <div className="flex items-center gap-1.5">
          <SearchField
            onboarding="picker-search"
            value={query}
            onChange={onQueryChange}
            placeholder="Search units, keywords, abilities…"
            label="Add a unit"
            clearLabel="Empty the picker filter"
            maxLength={80}
            className="min-w-0 flex-1"
            inputClassName="h-9"
          />
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
                  size="icon-sm"
                  aria-label="Format restrictions"
                  className={`shrink-0 ${waived.length ? 'text-discarded' : 'text-faint hover:text-bone'}`}
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
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.filter((filter) => signedIn || !filter.icon).map((filter) => (
            <FilterChip
              key={filter.id}
              label={filter.label}
              hint={filter.hint}
              icon={filter.icon}
              pressed={active.has(filter.id)}
              onToggle={() => onFilterToggle(filter.id)}
              unavailable={
                (filter.id === 'owned' && (!enabled || !collection.size)) || (filter.id === 'favourite' && (!enabled || !favourites.size))
                  ? filter.empty
                  : undefined
              }
            />
          ))}
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]]:px-2.5">
        {unitsResult.isPending || (signedIn && (collectionResult.isPending || favouritesLoading)) ? (
          <PickerSkeleton />
        ) : unitsResult.isError ? (
          <Problem className="py-3 text-xs">The book could not be loaded.</Problem>
        ) : shown.length || rows.unavailable.length ? (
          <>
            {savedLoadouts.isError ? <Problem className="py-2 text-xs">Your saved loadouts could not be loaded.</Problem> : null}
            {sections.map(({ id, plural, alliedFaction }) => {
              const group = shown
                .filter((unit) => (alliedFaction ? unit.alliedFaction === alliedFaction : !unit.allied && unit.group === id))
                .toSorted((left, right) => Number(favourites.has(right.id)) - Number(favourites.has(left.id)))
              const attached = group.flatMap((unit) => rows.loadouts.get(unit.id)?.filter(isAttachedUnit) ?? [])
              return group.length ? (
                <Fragment key={id}>
                  {alliedFaction === alliedFactions[0] ? <h2 className="rubric pt-1.5">Allied units</h2> : null}
                  <Section title={plural} count={group.length + attached.length} defaultOpen={!alliedFaction}>
                    {group.map((unit) => {
                      const held = inRoster[unit.id] ?? 0
                      const full = !canAddCopy(unit.id, held, limits)
                      return (
                        <Fragment key={unit.id}>
                          <PickerRow
                            unit={{ ...unit, limit: limits.has(unit.id) ? limits.get(unit.id)! : unit.limit }}
                            unavailableReason={limits.get(unit.id) === 0 ? unitLimitMessage(unit.id, held, limits) : null}
                            held={held}
                            full={full}
                            favourite={favourites.has(unit.id)}
                            favouritePending={favouriting.isPending && favouriting.variables?.entryId === unit.id}
                            query={query}
                            onPreview={onPreview}
                            onFavourite={signedIn ? toggleFavourite : undefined}
                            onAdd={onAdd}
                          />
                          {rows.loadouts
                            .get(unit.id)
                            ?.filter((loadout) => !isAttachedUnit(loadout))
                            .map((loadout) => (
                              <LoadoutRow
                                key={loadout.id}
                                loadout={loadout}
                                datasheet={unit.name}
                                addable={!full}
                                unavailableReason={null}
                                onPreview={onPreview}
                                onApply={onApplyLoadout}
                                onRename={setRenaming}
                                onDelete={setDeleting}
                              />
                            ))}
                        </Fragment>
                      )
                    })}
                    {attached.map((loadout) => (
                      <LoadoutRow
                        key={loadout.id}
                        loadout={loadout}
                        datasheet={datasheetNames.get(loadout.picks[0].entryId) ?? null}
                        members={loadout.picks.map((pick) => datasheetNames.get(pick.entryId) ?? pick.entryId)}
                        addable={fits(loadout.picks)}
                        unavailableReason={null}
                        onPreview={onPreview}
                        onApply={onApplyLoadout}
                        onRename={setRenaming}
                        onDelete={setDeleting}
                      />
                    ))}
                  </Section>
                </Fragment>
              ) : null
            })}
            {rows.unavailable.length ? (
              <Section title="Unavailable loadouts" count={rows.unavailable.length}>
                {rows.unavailable.map((loadout) => {
                  const { entryId } = loadout.picks.find((pick) => !offered.has(pick.entryId)) ?? loadout.picks[0]
                  const outcome = requestedUnit(entryId, inRoster[entryId] ?? 0, limits)
                  return (
                    <LoadoutRow
                      key={loadout.id}
                      loadout={loadout}
                      datasheet={null}
                      addable={false}
                      unavailableReason={outcome.kind === 'refused' ? outcome.message : null}
                      onPreview={onPreview}
                      onApply={onApplyLoadout}
                      onRename={setRenaming}
                      onDelete={setDeleting}
                    />
                  )
                })}
              </Section>
            ) : null}
          </>
        ) : (
          <p className="py-3 text-xs text-faint">
            {found?.length || loadouts.length ? 'Everything is filtered out.' : query ? 'No matching units.' : 'No units available.'}
          </p>
        )}
      </ScrollArea>
      {renaming ? (
        <LoadoutNameDialog
          title={`Rename ${loadoutNoun(renaming)}`}
          initialName={renaming.name}
          submit="Rename"
          pendingLabel="Renaming…"
          accepts={(name) => name !== renaming.name}
          pending={rename.isPending}
          error={rename.error}
          onSubmit={(name) => rename.mutate({ id: renaming.id, name }, { onSuccess: () => setRenaming(null) })}
          onClose={() => {
            rename.reset()
            setRenaming(null)
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete saved ${loadoutNoun(deleting)}?`}
        description={`${deleting?.name ?? `This ${loadoutNoun(deleting)}`} leaves your saved loadouts. Rosters that already use it keep their units.`}
        cancel={`Keep ${loadoutNoun(deleting)}`}
        confirm={`Delete ${loadoutNoun(deleting)}`}
        pendingLabel="Deleting…"
        destructive
        pending={remove.isPending}
        error={remove.error}
        onClose={() => {
          remove.reset()
          setDeleting(null)
        }}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
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
          <PointsChip />
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
  unavailableReason,
  onPreview,
  onFavourite,
  onAdd,
}: PickerRowProps) {
  return (
    <div
      data-picker-unit={unit.name}
      className="flex flex-wrap items-center gap-1.5 border border-edge bg-card px-2.5 py-1.5 [contain:layout_style] [contain-intrinsic-size:auto_3.25rem] [content-visibility:auto]"
    >
      <button
        type="button"
        className="flex min-w-12 flex-1 items-center gap-1.5 text-left hover:text-info"
        aria-label={`View ${unit.name} datasheet`}
        onClick={() => onPreview(unit.id, unit.name)}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-tight font-semibold tracking-wide uppercase">{unit.name}</span>
          <DatasheetMatchReasons query={query} reasons={unit.matchReasons} fuzzy={unit.fuzzy} />
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
      <span className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1.5">
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
        <PointsChip points={unit.points} />
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
