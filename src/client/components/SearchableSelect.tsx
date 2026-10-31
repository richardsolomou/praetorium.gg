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
import type { Virtualizer } from '@tanstack/react-virtual'
import { type ReactNode, type RefObject, useCallback, useImperativeHandle, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'
import { LoaderCircle } from 'lucide-react'
import { FactionLabel, type FactionPresentation } from './FactionMark'
import type { OnboardingTarget } from '../onboardingTargets'
import { useVirtualRows } from './useVirtualRows'
import { matchesSearch } from '../text'

/**
 * One choice, optionally with something drawn beside its name.
 *
 * `faction` is the faction mark and its name together; `icon` is anything else a
 * caller wants in front of the label, such as the picture on a player's account.
 * `detail` sits at the end of the row in the list, such as a unit's points.
 */
export type SearchableOption = {
  label: string
  value: string
  faction?: FactionPresentation
  icon?: ReactNode
  /** Visual label; search and accessible names still use `label`. */
  content?: ReactNode
  detail?: string
}
export type SearchableGroup = { label: string; items: SearchableOption[] }
type GroupedOption = SearchableOption & { group: string }
type Row = { kind: 'group'; label: string } | { kind: 'option'; option: GroupedOption; index: number }
type VirtualList = { virtualizer: Virtualizer<HTMLDivElement, Element>; rowOf: (index: number) => number }

type Props = {
  id?: string
  ariaLabel?: string
  title?: string
  groups: SearchableGroup[]
  value: string
  selectedFaction?: FactionPresentation
  onValueChange: (value: string) => void
  placeholder: string
  searchPlaceholder?: string
  className?: string
  popupClassName?: string
  disabled?: boolean
  loading?: boolean
  trigger?: ReactNode
  onboarding?: OnboardingTarget
  /** Renders only the visible rows, for lists too long to mount at once. */
  virtualized?: boolean
  /** Shown when no option matches, such as while the options are still loading. */
  emptyText?: string
  /** Pinned between the search box and the list, such as a way to another list. */
  header?: ReactNode
  /** Opens on mount, for a list that replaces another while the reader moves between levels. */
  defaultOpen?: boolean
  onOpenChange?: (open: boolean, reason: ComboboxPrimitive.Root.ChangeEventReason) => void
}

export function SearchableSelect({
  id,
  ariaLabel,
  title,
  groups,
  value,
  selectedFaction,
  onValueChange,
  placeholder,
  searchPlaceholder = 'Search…',
  className,
  popupClassName,
  disabled = false,
  loading = false,
  trigger,
  onboarding,
  virtualized = false,
  emptyText = 'No matches.',
  header,
  defaultOpen,
  onOpenChange,
}: Props) {
  const options = useMemo(() => groups.flatMap((group) => group.items.map((option) => ({ ...option, group: group.label }))), [groups])
  const selected = options.find((option) => option.value === value) ?? null
  const list = useRef<HTMLDivElement>(null)
  const virtual = useRef<VirtualList | null>(null)

  return (
    <Combobox
      disabled={disabled}
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
      defaultOpen={defaultOpen}
      onOpenChange={(open, details) => {
        if (open && !virtualized) requestAnimationFrame(() => centreSelected(list.current))
        onOpenChange?.(open, details.reason)
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
        title={title}
        aria-busy={loading}
        className={cn(
          'flex h-8 w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-lg border border-input bg-transparent px-2.5 text-sm font-normal text-bone outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted data-placeholder:text-muted-foreground',
          trigger || loading ? '[&>svg:last-child]:hidden' : undefined,
          className,
        )}
      >
        {trigger ?? (
          <span className="min-w-0 flex-1 truncate text-left">
            <ComboboxValue placeholder={<span>{placeholder}</span>}>
              {selected ? selectedFaction ? <FactionLabel faction={selectedFaction} /> : <OptionLabel option={selected} /> : null}
            </ComboboxValue>
          </span>
        )}
        {loading ? <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden /> : null}
      </ComboboxTrigger>
      <ComboboxContent
        align={trigger ? 'end' : 'start'}
        className={cn('transition-none', trigger ? 'w-72 min-w-64 max-w-[calc(100vw-2rem)]' : undefined, popupClassName)}
      >
        <ComboboxInput placeholder={searchPlaceholder} showTrigger={false} />
        {header}
        <ComboboxEmpty className="text-dim">{emptyText}</ComboboxEmpty>
        <ComboboxList ref={list} className={virtualized ? 'max-h-none overflow-visible p-0' : undefined}>
          {virtualized ? (
            <VirtualOptions handle={virtual} selected={value} />
          ) : (
            (group: SearchableGroup) => (
              <ComboboxGroup key={group.label} items={group.items} className="pb-1 last:pb-0">
                {group.label ? <ComboboxLabel className="eyebrow text-faint">{group.label}</ComboboxLabel> : null}
                <ComboboxCollection>
                  {(option: SearchableOption) => (
                    <ComboboxItem
                      key={option.value}
                      value={option}
                      aria-label={[option.label, option.detail].filter(Boolean).join(', ')}
                      className="data-highlighted:bg-edge"
                    >
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

/**
 * Scrolls the open list, and only the list, so the chosen option sits in its middle.
 *
 * `scrollIntoView` also scrolls every ancestor that can, which would move a page under
 * the pointer that opened the select.
 */
function centreSelected(container: HTMLElement | null) {
  const item = container?.querySelector<HTMLElement>('[data-selected]')
  if (!container || !item) return
  const offset = item.getBoundingClientRect().top - container.getBoundingClientRect().top
  container.scrollTop += offset - (container.clientHeight - item.offsetHeight) / 2
}

/** Every search word must appear in the option or its group, so a faction name narrows a long flat list. */
const matchesGroupedOption = (option: GroupedOption, query: string) => matchesSearch(`${option.label} ${option.group}`, query)

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
  const { items, totalSize, virtualizer } = useVirtualRows({
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
      <div role="presentation" className="relative w-full" style={{ height: totalSize }}>
        {items.map((item) => {
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
  if (option.content) return option.content
  if (option.faction) return <FactionLabel faction={option.faction} />
  if (!option.icon) return <span>{option.label}</span>
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
      {option.icon}
      <span className="truncate">{option.label}</span>
    </span>
  )
}
