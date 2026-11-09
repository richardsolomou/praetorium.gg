import { Ban, Bookmark, Check, ChevronDown, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  facetActive,
  LIST_FILTER_SCOPES,
  listPreferencesSchema,
  MAX_SAVED_VIEWS,
  PERIODS,
  SAVED_VIEW_NAME_MAX_LENGTH,
  type Facet,
  type FacetAddress,
  type ListFilterScope,
  type ListPreferences,
  type Period,
  type PeriodFilter,
} from '../../core/listFilter'
import { setListFilterPreferences } from '../functions'
import { listFilterPreferencesQuery, meQuery } from '../queries'
import { listFilterPreferencesKey } from '../queries/queryKeys'
import { parseStored, useStoredValue, writeStoredValue } from '../storedValue'
import { matchesSearch } from '../text'
import { FactionMark } from './FactionMark'
import { SearchField } from './SearchField'
import type { SearchableGroup, SearchableOption } from './SearchableSelect'

export type FilterDimension = {
  key: string
  label: string
  groups: SearchableGroup[]
  /** Shown in the bar until the player chooses otherwise; the rest wait in Customise. */
  pinned?: boolean
}

const SEARCHABLE_FROM = 8
const SEARCH_SETTLE_MS = 250
const PERIOD_LABEL: Record<Period, string> = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', '1y': 'Last year' }

const preferencesKey = (scope: ListFilterScope) => `praetorium:filters:${scope}`

/** Sign-out leaves them on the account; left here, they would upload into whoever signs in next. */
export function forgetDeviceFilterPreferences() {
  for (const scope of LIST_FILTER_SCOPES) writeStoredValue(preferencesKey(scope), null)
}

/**
 * What this player keeps in the bar and the views they saved, per list.
 *
 * Browser storage is what renders, so a visitor and an offline page work the same. A signed-in player's account is the
 * authority over it: its copy replaces this device's, and a list the account has never heard of takes this device's.
 */
function usePreferences(scope: ListFilterScope) {
  const key = preferencesKey(scope)
  const stored = useStoredValue(key)
  const preferences: ListPreferences = parseStored(listPreferencesSchema, stored) ?? { pinned: null, views: [] }
  const queryClient = useQueryClient()
  const { data: me } = useQuery(meQuery())
  const { data: account } = useQuery({ ...listFilterPreferencesQuery(), enabled: Boolean(me) })
  const { mutate } = useMutation({
    mutationFn: (next: ListPreferences) => setListFilterPreferences({ data: { scope, preferences: next } }),
    onError: () => {
      toast.error('Could not save that to your account.')
      void queryClient.invalidateQueries({ queryKey: listFilterPreferencesKey() })
    },
  })
  const keep = useCallback(
    (next: ListPreferences) => {
      void queryClient.cancelQueries({ queryKey: listFilterPreferencesKey() })
      queryClient.setQueryData(listFilterPreferencesQuery().queryKey, (current) => ({ ...current, [scope]: next }))
      mutate(next)
    },
    [mutate, queryClient, scope],
  )
  const signedIn = Boolean(me)
  const kept = account?.[scope]
  // A refused upload refetches an account still without this list, which must not ask again.
  const uploaded = useRef(false)
  useEffect(() => {
    if (!signedIn || !account) return
    if (kept) {
      const held = JSON.stringify(kept)
      if (held !== stored) writeStoredValue(key, held)
      return
    }
    const device = parseStored(listPreferencesSchema, stored)
    if (uploaded.current || !device || (!device.pinned && !device.views.length)) return
    uploaded.current = true
    keep(device)
  }, [signedIn, account, kept, stored, key, keep])
  return [
    preferences,
    (next: ListPreferences) => {
      writeStoredValue(key, JSON.stringify(next))
      if (me) keep(next)
    },
  ] as const
}

const optionsOf = (groups: SearchableGroup[]) => groups.flatMap((group) => group.items)

function periodLabel({ period, from, to }: PeriodFilter) {
  if (period) return PERIOD_LABEL[period]
  if (from && to) return `${from} to ${to}`
  if (from) return `From ${from}`
  return to ? `Until ${to}` : null
}

/**
 * The search, filters, saved views and sort every battle and roster list narrows by.
 *
 * Inline rather than in a dialog, so what is narrowing the list stays on screen beside it. Excluded values use the
 * struck line form, the same as a discarded mission card, so "not this" never reads as a selection.
 */
export function FilterBar({
  scope,
  label,
  query,
  onQuery,
  placeholder,
  maxQueryLength,
  dimensions,
  value,
  onChange,
  period,
  address,
  onApply,
  sort,
  summary,
}: {
  /** Which list's preferences these are; different tabs offer different filters. */
  scope: ListFilterScope
  label: string
  query: string
  onQuery: (query: string) => void
  placeholder: string
  maxQueryLength: number
  dimensions: FilterDimension[]
  value: Record<string, Facet | undefined>
  onChange: (key: string, facet: Facet | undefined) => void
  period?: { label: string; value: PeriodFilter; onChange: (next: PeriodFilter) => void }
  /** The filters as the address holds them, which a saved view keeps and gives back to `onApply`. */
  address: Record<string, FacetAddress | undefined>
  onApply: (address: Record<string, FacetAddress>) => void
  sort?: ReactNode
  summary?: ReactNode
}) {
  const [preferences, save] = usePreferences(scope)
  const periodActive = Boolean(period && periodLabel(period.value))
  const filled = Object.fromEntries(Object.entries(address).filter((entry): entry is [string, FacetAddress] => Boolean(entry[1])))
  const active = Object.keys(filled).length > 0
  const isPinned = (dimension: FilterDimension) => preferences.pinned?.includes(dimension.key) ?? Boolean(dimension.pinned)
  // A filter in use always shows, or a saved view or shared link could narrow the list with nothing on screen to say so.
  const shown = dimensions.filter(
    (dimension) => facetActive(value[dimension.key]) || (isPinned(dimension) && optionsOf(dimension.groups).length),
  )
  const pinnable = dimensions.filter((dimension) => optionsOf(dimension.groups).length)
  const periodPinned = period ? (preferences.pinned?.includes('period') ?? true) : false
  const togglePin = (key: string, on: boolean) => {
    const current = preferences.pinned ?? [
      ...dimensions.filter((dimension) => dimension.pinned).map((dimension) => dimension.key),
      'period',
    ]
    save({ ...preferences, pinned: on ? [...current, key] : current.filter((pinned) => pinned !== key) })
  }

  return (
    <fieldset data-filter-bar={scope} aria-label={`${label} filters`} className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <SettledSearch
          value={query}
          onChange={onQuery}
          placeholder={placeholder}
          label={`Search ${label.toLowerCase()}s`}
          maxLength={maxQueryLength}
        />
        <SavedViews
          views={preferences.views}
          canSave={active}
          onApply={onApply}
          onSave={(name) =>
            save({
              ...preferences,
              views: [...preferences.views.filter((view) => view.name !== name), { name, address: filled }].slice(-MAX_SAVED_VIEWS),
            })
          }
          onDelete={(name) => save({ ...preferences, views: preferences.views.filter((view) => view.name !== name) })}
        />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" aria-label="Customise filters" />}>
            <SlidersHorizontal />
            <span className="max-sm:sr-only">Customise</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="eyebrow text-faint">Show in the bar</DropdownMenuLabel>
              {pinnable.map((dimension) => (
                <DropdownMenuCheckboxItem
                  key={dimension.key}
                  checked={isPinned(dimension)}
                  onCheckedChange={(on) => togglePin(dimension.key, on)}
                >
                  {dimension.label}
                </DropdownMenuCheckboxItem>
              ))}
              {period ? (
                <DropdownMenuCheckboxItem checked={periodPinned} onCheckedChange={(on) => togglePin('period', on)}>
                  {period.label}
                </DropdownMenuCheckboxItem>
              ) : null}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={preferences.pinned === null} onClick={() => save({ ...preferences, pinned: null })}>
              Reset to default
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {sort}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {shown.map((dimension) => (
          <FacetPill
            key={dimension.key}
            dimension={dimension}
            facet={value[dimension.key]}
            onChange={(facet) => onChange(dimension.key, facet)}
          />
        ))}
        {period && (periodPinned || periodActive) ? <PeriodPill {...period} /> : null}
        {active ? (
          <Button variant="ghost" size="sm" onClick={() => onApply({})}>
            Clear filters
          </Button>
        ) : null}
        {summary ? <span className="readout ml-auto text-xs text-dim">{summary}</span> : null}
      </div>
    </fieldset>
  )
}

/** Holds each keystroke here, so typing never re-reads the list or rewrites the address per letter. */
function SettledSearch({
  value,
  onChange,
  placeholder,
  label,
  maxLength,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  maxLength: number
}) {
  const [typed, setTyped] = useState(value)
  const [settled, setSettled] = useState(value)
  if (settled !== value) {
    setSettled(value)
    setTyped(value)
  }
  useEffect(() => {
    if (typed === value) return
    const timer = setTimeout(() => onChange(typed), SEARCH_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [typed, value, onChange])
  return (
    <SearchField
      value={typed}
      onChange={setTyped}
      placeholder={placeholder}
      label={label}
      clearLabel="Clear search"
      maxLength={maxLength}
      className="min-w-48 flex-1"
    />
  )
}

const pillClass = (on: boolean) =>
  cn(
    'inline-flex h-8 max-w-64 items-center gap-1.5 border px-2.5 text-xs font-semibold transition-colors',
    on ? 'border-parchment/60 bg-parchment/12 text-bone' : 'border-runner text-dim hover:border-runner-hi hover:text-bone',
  )

function FacetPill({
  dimension,
  facet,
  onChange,
}: {
  dimension: FilterDimension
  facet: Facet | undefined
  onChange: (facet: Facet | undefined) => void
}) {
  const on = facetActive(facet)
  const options = optionsOf(dimension.groups)
  const labelOf = (value: string) => options.find((option) => option.value === value)?.label ?? value
  const first = on ? (facet.in[0] ?? facet.out[0]!) : null
  const count = on ? facet.in.length + facet.out.length : 0
  const name = first === null ? dimension.label : `${dimension.label}: ${labelOf(first)}${count > 1 ? ` and ${count - 1} more` : ''}`
  return (
    <span className="inline-flex" data-filter={dimension.key}>
      <Popover>
        <PopoverTrigger
          render={<button type="button" aria-label={name} className={cn(pillClass(on), on ? 'rounded-l-lg border-r-0' : 'rounded-lg')} />}
        >
          <span className={on ? 'text-dim' : undefined}>{dimension.label}</span>
          {first !== null ? (
            <span className={cn('truncate', facet?.in[0] === undefined && 'text-discarded line-through')}>
              {labelOf(first)}
              {count > 1 ? <span className="readout ml-1 text-dim">+{count - 1}</span> : null}
            </span>
          ) : (
            <ChevronDown className="size-3.5" aria-hidden />
          )}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="max-h-[min(26rem,var(--available-height))] w-72 max-w-[calc(100vw-1.5rem)] gap-2 overflow-y-auto"
        >
          <FacetChoices dimension={dimension} facet={facet} onChange={onChange} />
        </PopoverContent>
      </Popover>
      {on ? (
        <button
          type="button"
          aria-label={`Clear ${dimension.label}`}
          onClick={() => onChange(undefined)}
          className={cn(pillClass(true), 'rounded-r-lg px-1.5 hover:text-bone')}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </span>
  )
}

/** Pressing a row chooses it and the ban beside it rules it out; choosing several means any of them. */
function FacetChoices({
  dimension,
  facet,
  onChange,
}: {
  dimension: FilterDimension
  facet: Facet | undefined
  onChange: (facet: Facet | undefined) => void
}) {
  const [typed, setTyped] = useState('')
  const included = facet?.in ?? []
  const excluded = facet?.out ?? []
  const write = (nextIn: string[], nextOut: string[]) =>
    onChange(nextIn.length || nextOut.length ? { in: nextIn, out: nextOut } : undefined)
  const without = (list: string[], value: string) => list.filter((entry) => entry !== value)
  const toggleIn = (value: string) =>
    write(included.includes(value) ? without(included, value) : [...included, value], without(excluded, value))
  const toggleOut = (value: string) =>
    write(without(included, value), excluded.includes(value) ? without(excluded, value) : [...excluded, value])
  const seen = new Set<string>()
  const groups = dimension.groups
    .map((group) => ({
      ...group,
      items: group.items.filter((option) => {
        if (seen.has(option.value) || !matchesSearch(option.label, typed)) return false
        seen.add(option.value)
        return true
      }),
    }))
    .filter((group) => group.items.length)

  return (
    <>
      {optionsOf(dimension.groups).length >= SEARCHABLE_FROM ? (
        <SearchField
          value={typed}
          onChange={setTyped}
          placeholder={`Find ${dimension.label.toLowerCase()}…`}
          label={`Find ${dimension.label.toLowerCase()}`}
          clearLabel="Clear"
        />
      ) : null}
      {groups.map((group) => (
        <div key={group.label || 'all'}>
          {group.label ? <p className="eyebrow px-1 pb-1 text-faint">{group.label}</p> : null}
          <ul className="grid gap-px">
            {group.items.map((option) => (
              <FacetRow
                key={option.value}
                option={option}
                included={included.includes(option.value)}
                excluded={excluded.includes(option.value)}
                onInclude={() => toggleIn(option.value)}
                onExclude={() => toggleOut(option.value)}
              />
            ))}
          </ul>
        </div>
      ))}
      {groups.length ? null : <p className="px-1 py-2 text-xs text-dim">Nothing matches that.</p>}
    </>
  )
}

function FacetRow({
  option,
  included,
  excluded,
  onInclude,
  onExclude,
}: {
  option: SearchableOption
  included: boolean
  excluded: boolean
  onInclude: () => void
  onExclude: () => void
}) {
  return (
    <li className="flex items-stretch rounded-md hover:bg-raised">
      <button
        type="button"
        aria-pressed={included}
        onClick={onInclude}
        className="flex min-h-9 min-w-0 flex-1 items-center gap-2 px-1.5 text-left text-sm"
      >
        <span
          aria-hidden
          className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded-sm border',
            included ? 'border-parchment bg-parchment text-parchment-ink' : 'border-runner',
          )}
        >
          {included ? <Check className="size-3" /> : null}
        </span>
        {option.faction ? <FactionMark faction={option.faction} size="sm" /> : option.icon}
        <span className={cn('min-w-0 flex-1 truncate', excluded && 'text-discarded line-through')}>{option.label}</span>
        {option.detail ? <span className="readout text-2xs text-faint">{option.detail}</span> : null}
      </button>
      <button
        type="button"
        aria-pressed={excluded}
        aria-label={`Exclude ${option.label}`}
        onClick={onExclude}
        className={cn('flex w-9 shrink-0 items-center justify-center', excluded ? 'text-discarded' : 'text-faint hover:text-bone')}
      >
        <Ban className="size-3.5" aria-hidden />
      </button>
    </li>
  )
}

function PeriodPill({ label, value, onChange }: { label: string; value: PeriodFilter; onChange: (next: PeriodFilter) => void }) {
  const chosen = periodLabel(value)
  return (
    <span className="inline-flex" data-filter="period">
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={chosen ? `${label}: ${chosen}` : label}
              className={cn(pillClass(Boolean(chosen)), chosen ? 'rounded-l-lg border-r-0' : 'rounded-lg')}
            />
          }
        >
          <span className={chosen ? 'text-dim' : undefined}>{label}</span>
          {chosen ? <span className="truncate">{chosen}</span> : <ChevronDown className="size-3.5" aria-hidden />}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 max-w-[calc(100vw-1.5rem)]">
          <ul className="grid gap-px">
            {PERIODS.map((period) => (
              <li key={period}>
                <button
                  type="button"
                  aria-pressed={value.period === period}
                  onClick={() => onChange(value.period === period ? {} : { period })}
                  className="flex min-h-9 w-full items-center justify-between rounded-md px-1.5 text-left text-sm hover:bg-raised"
                >
                  {PERIOD_LABEL[period]}
                  {value.period === period ? <Check className="size-3.5 text-parchment" aria-hidden /> : null}
                </button>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2 border-t border-edge pt-2">
            <div>
              <Label className="eyebrow block">From</Label>
              <Input
                type="date"
                aria-label={`${label} from`}
                value={value.from ?? ''}
                onChange={(event) => onChange({ from: event.target.value || undefined, to: value.to })}
                className="mt-1 px-1.5"
              />
            </div>
            <div>
              <Label className="eyebrow block">To</Label>
              <Input
                type="date"
                aria-label={`${label} to`}
                value={value.to ?? ''}
                onChange={(event) => onChange({ from: value.from, to: event.target.value || undefined })}
                className="mt-1 px-1.5"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {chosen ? (
        <button
          type="button"
          aria-label={`Clear ${label}`}
          onClick={() => onChange({})}
          className={cn(pillClass(true), 'rounded-r-lg px-1.5')}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </span>
  )
}

function SavedViews({
  views,
  canSave,
  onApply,
  onSave,
  onDelete,
}: {
  views: ListPreferences['views']
  canSave: boolean
  onApply: (address: Record<string, FacetAddress>) => void
  onSave: (name: string) => void
  onDelete: (name: string) => void
}) {
  const [name, setName] = useState('')
  const trimmed = name.trim()
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" aria-label="Saved views" />}>
        <Bookmark />
        <span className="max-sm:sr-only">Views</span>
        {views.length ? <span className="chip readout">{views.length}</span> : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 max-w-[calc(100vw-1.5rem)]">
        {views.length ? (
          <ul className="grid gap-px">
            {views.map((view) => (
              <li key={view.name} className="flex items-stretch rounded-md hover:bg-raised">
                <button
                  type="button"
                  onClick={() => onApply(view.address)}
                  className="min-h-9 min-w-0 flex-1 truncate px-1.5 text-left text-sm"
                >
                  {view.name}
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${view.name}`}
                  onClick={() => onDelete(view.name)}
                  className="flex w-9 shrink-0 items-center justify-center text-faint hover:text-bone"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-1 text-xs text-dim">Save the filters you use often, and come back to them in one press.</p>
        )}
        <form
          className="flex gap-2 border-t border-edge pt-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!trimmed || !canSave) return
            onSave(trimmed)
            setName('')
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={SAVED_VIEW_NAME_MAX_LENGTH}
            placeholder={canSave ? 'Name this view' : 'Choose some filters first'}
            aria-label="View name"
            disabled={!canSave}
          />
          <Button type="submit" variant="outline" disabled={!canSave || !trimmed}>
            Save
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
