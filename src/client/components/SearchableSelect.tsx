import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from '@/components/ui/combobox'
import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox'
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual'
import { type ReactNode, type RefObject, useCallback, useImperativeHandle, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'
import { FactionLabel, type FactionPresentation } from './FactionMark'
import type { OnboardingTarget } from '../onboardingTargets'

/**
 * One choice, optionally with something drawn beside its name.
 *
 * `faction` is the faction mark and its name together; `icon` is anything else a
 * caller wants in front of the label, such as the picture on a player's account.
 * `detail` sits at the end of the row in the list, such as a unit's points.
 */
export type SearchableOption = { label: string; value: string; faction?: FactionPresentation; icon?: ReactNode; detail?: string }
export type SearchableGroup = { label: string; items: SearchableOption[] }
type GroupedOption = SearchableOption & { group: string }
type Row = { kind: 'group'; label: string } | { kind: 'option'; option: GroupedOption; index: number }
type VirtualList = { virtualizer: Virtualizer<HTMLDivElement, Element>; rowOf: (index: number) => number }

type Props = {
  id?: string
  ariaLabel?: string
  groups: SearchableGroup[]
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  searchPlaceholder?: string
  className?: string
  onboarding?: OnboardingTarget
  /** Renders only the visible rows, for lists too long to mount at once. */
  virtualized?: boolean
}

export function SearchableSelect({
  id,
  ariaLabel,
  groups,
  value,
  onValueChange,
  placeholder,
  searchPlaceholder = 'Search…',
  className,
  onboarding,
  virtualized = false,
}: Props) {
  const options = useMemo(() => groups.flatMap((group) => group.items.map((option) => ({ ...option, group: group.label }))), [groups])
  const selected = options.find((option) => option.value === value) ?? null
  const list = useRef<HTMLDivElement>(null)
  const virtual = useRef<VirtualList | null>(null)

  return (
    <Combobox
      items={virtualized ? options : groups}
      virtualized={virtualized}
      filter={virtualized ? matchesGroupedOption : undefined}
      value={selected}
      onValueChange={(option) => {
        if (option) onValueChange(option.value)
      }}
      itemToStringLabel={(option) => option.label}
      itemToStringValue={(option) => option.value}
      isItemEqualToValue={(option, candidate) => option.value === candidate.value}
      onOpenChange={(open) => {
        if (open && !virtualized)
          requestAnimationFrame(() => list.current?.querySelector('[data-selected]')?.scrollIntoView({ block: 'center' }))
      }}
      onItemHighlighted={(option, { reason, index }) => {
        const current = virtual.current
        if (!option || !current || reason === 'pointer') return
        queueMicrotask(() => current.virtualizer.scrollToIndex(current.rowOf(index), { align: 'auto' }))
      }}
    >
      <ComboboxTrigger
        id={id}
        data-onboarding={onboarding}
        aria-label={ariaLabel}
        className={cn(
          'flex h-8 w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-lg border border-input bg-transparent px-2.5 text-sm font-normal text-bone outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted data-placeholder:text-muted-foreground',
          className,
        )}
      >
        <span className="min-w-0 flex-1 overflow-hidden text-left">
          <ComboboxValue placeholder={placeholder}>{selected ? <OptionLabel option={selected} /> : null}</ComboboxValue>
        </span>
      </ComboboxTrigger>
      <ComboboxContent className="transition-none">
        <ComboboxInput placeholder={searchPlaceholder} showTrigger={false} />
        <ComboboxEmpty className="text-dim">No matches.</ComboboxEmpty>
        <ComboboxList ref={list} className={virtualized ? 'max-h-none overflow-visible p-0' : undefined}>
          {virtualized ? (
            <VirtualOptions handle={virtual} selected={value} />
          ) : (
            (group: SearchableGroup) => (
              <ComboboxGroup key={group.label} items={group.items} className="pb-1 last:pb-0">
                {group.label ? <ComboboxLabel className="eyebrow text-faint">{group.label}</ComboboxLabel> : null}
                <ComboboxCollection>
                  {(option: SearchableOption) => (
                    <ComboboxItem key={option.value} value={option} className="data-highlighted:bg-edge">
                      <OptionContent option={option} />
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            )
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

const searchable = (text: string) =>
  text
    .normalize('NFD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Every search word must appear in the option or its group, so a faction name narrows a long flat list. */
function matchesGroupedOption(option: GroupedOption, query: string) {
  const text = searchable(`${option.label} ${option.group}`)
  return searchable(query)
    .split(/\s+/)
    .every((word) => text.includes(word))
}

/** Group headings become rows of their own, since a virtual list cannot nest the options inside group elements. */
function VirtualOptions({ handle, selected }: { handle: RefObject<VirtualList | null>; selected: string }) {
  const filtered = ComboboxPrimitive.useFilteredItems<GroupedOption>()
  const scroller = useRef<HTMLDivElement | null>(null)
  const { rows, rowByIndex } = useMemo(() => {
    const built: Row[] = []
    const positions: number[] = []
    filtered.forEach((option, index) => {
      if (option.group && option.group !== filtered[index - 1]?.group) built.push({ kind: 'group', label: option.group })
      positions.push(built.length)
      built.push({ kind: 'option', option, index })
    })
    return { rows: built, rowByIndex: positions }
  }, [filtered])
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: (index) => (rows[index]?.kind === 'group' ? 28 : 32),
    overscan: 12,
  })
  useImperativeHandle(handle, () => ({ virtualizer, rowOf: (index) => rowByIndex[index] ?? 0 }), [virtualizer, rowByIndex])
  const initial = useRef({ filtered, rowByIndex, selected })
  // Runs once per opening, so the list opens at the current selection and later filtering keeps the scroll position.
  const attach = useCallback(
    (element: HTMLDivElement | null) => {
      scroller.current = element
      if (!element) return
      virtualizer.measure()
      const opened = initial.current
      const index = opened.filtered.findIndex((option) => option.value === opened.selected)
      if (index >= 0) requestAnimationFrame(() => virtualizer.scrollToIndex(opened.rowByIndex[index]!, { align: 'center' }))
    },
    [virtualizer],
  )
  if (!rows.length) return null
  return (
    <div
      ref={attach}
      role="presentation"
      className="no-scrollbar max-h-[min(calc(--spacing(72)---spacing(9)),calc(var(--available-height)---spacing(9)))] overflow-y-auto overscroll-contain p-1"
    >
      <div role="presentation" className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index]!
          const position = { transform: `translateY(${item.start}px)` }
          return row.kind === 'group' ? (
            <div
              key={item.key}
              aria-hidden
              data-index={item.index}
              ref={virtualizer.measureElement}
              className="eyebrow absolute top-0 left-0 w-full px-2 pt-2 pb-1 text-faint"
              style={position}
            >
              {row.label}
            </div>
          ) : (
            <ComboboxItem
              key={item.key}
              index={row.index}
              value={row.option}
              data-index={item.index}
              ref={virtualizer.measureElement}
              aria-label={[row.option.label, row.option.group, row.option.detail].filter(Boolean).join(', ')}
              aria-setsize={filtered.length}
              aria-posinset={row.index + 1}
              className="absolute top-0 left-0 data-highlighted:bg-edge"
              style={position}
            >
              <OptionContent option={row.option} />
            </ComboboxItem>
          )
        })}
      </div>
    </div>
  )
}

function OptionContent({ option }: { option: SearchableOption }) {
  return (
    <>
      <OptionLabel option={option} />
      {option.detail ? <span className="ml-auto shrink-0 pl-3 text-xs text-dim">{option.detail}</span> : null}
    </>
  )
}

function OptionLabel({ option }: { option: SearchableOption }) {
  if (option.faction) return <FactionLabel faction={option.faction} />
  if (!option.icon) return option.label
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
      {option.icon}
      <span className="truncate">{option.label}</span>
    </span>
  )
}
