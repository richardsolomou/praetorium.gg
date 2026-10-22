import { defaultRangeExtractor } from '@tanstack/react-virtual'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GlobalSearchResult } from '../../functions'
import { DatasheetMatchReasons } from '../../components/DatasheetMatchReasons'
import { useVirtualRows } from '../../components/useVirtualRows'
import { globalSearchGroups } from './globalSearchPages'
import { rememberSearch } from './searchHistory'
import { SearchResultDetail } from './SearchResultDetail'

/** Each search starts its list at the top. */
export function SearchResults(props: Parameters<typeof ResultList>[0]) {
  return <ResultList key={props.query} {...props} />
}

function ResultList({
  results,
  query,
  listId,
  selectedIndex,
  onSelect,
  before,
}: {
  /** Shown above the results in the same scrolling area, so the dialog has one scrollbar. */
  before?: ReactNode
  results: GlobalSearchResult[]
  query: string
  listId?: string
  selectedIndex?: number
  onSelect?: (result: GlobalSearchResult) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [leadHeight, setLeadHeight] = useState(0)
  // The rows start below what leads them, so they are virtualized from that offset.
  const lead = useCallback((node: HTMLDivElement) => {
    const observer = new ResizeObserver(() => setLeadHeight(node.offsetHeight))
    observer.observe(node)
    return () => {
      observer.disconnect()
      setLeadHeight(0)
    }
  }, [])
  const rows = useMemo(
    () =>
      globalSearchGroups.flatMap((group) => {
        const items = results.map((result, index) => ({ result, index })).filter(({ result }) => result.group === group)
        return items.length
          ? [
              {
                kind: 'heading' as const,
                label: group === 'Datasheets' && items.every(({ result }) => result.fuzzy) ? 'Close matches' : group,
              },
              ...items.map(({ result, index }) => ({ kind: 'result' as const, result, index })),
            ]
          : []
      }),
    [results],
  )
  const activeRow = rows.findIndex((row) => row.kind === 'result' && row.index === selectedIndex)
  const { items, totalSize, virtualizer } = useVirtualRows({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: (index) => {
      const row = rows[index]
      if (row?.kind === 'heading') return 36
      return row?.result.matchReasons?.length ? 103 : 76
    },
    getItemKey: (index) => {
      const row = rows[index]!
      return row.kind === 'heading' ? row.label : row.result.id
    },
    initialRect: { width: 600, height: 480 },
    scrollMargin: leadHeight,
    overscan: 5,
    rangeExtractor: (range) =>
      [...new Set([...defaultRangeExtractor(range), ...(activeRow >= 0 ? [activeRow] : [])])].sort((a, b) => a - b),
  })
  // Only a moved selection scrolls, so the list opens at the top with anything leading it in view.
  const shownRow = useRef(activeRow)
  useEffect(() => {
    if (activeRow < 0 || activeRow === shownRow.current) return
    shownRow.current = activeRow
    virtualizer.scrollToIndex(activeRow, { align: 'auto' })
  }, [activeRow, virtualizer])

  // oxlint-disable jsx-a11y/prefer-tag-over-role -- Native options cannot contain faction marks and match details.
  return (
    <div ref={scroller} className="max-h-[min(60vh,30rem)] overflow-y-auto overscroll-contain">
      {before ? <div ref={lead}>{before}</div> : null}
      <div
        id={listId}
        role={onSelect ? 'listbox' : 'region'}
        aria-label="Search results"
        className="relative w-full"
        style={{ height: totalSize }}
      >
        {items.map((item) => {
          const row = rows[item.index]!
          const content =
            row.kind === 'result' ? (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold uppercase">{row.result.label}</span>
                  <SearchResultDetail result={row.result} />
                  <DatasheetMatchReasons query={query} reasons={row.result.matchReasons} />
                </span>
                <ChevronRight className="size-4 shrink-0 text-dim" aria-hidden />
              </>
            ) : null
          return (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full px-1 pb-1"
              style={{ transform: `translateY(${item.start - leadHeight}px)` }}
            >
              {row.kind === 'heading' ? (
                <h2 className="rubric border-b border-edge px-3 py-2">{row.label}</h2>
              ) : onSelect ? (
                <button
                  type="button"
                  role="option"
                  id={`${listId}-${row.index}`}
                  aria-selected={selectedIndex === row.index}
                  aria-posinset={row.index + 1}
                  aria-setsize={results.length}
                  tabIndex={-1}
                  onClick={() => onSelect(row.result)}
                  className="flex w-full items-center gap-2 border-l-2 border-transparent px-3 py-3 text-left hover:bg-parchment/10 aria-selected:border-parchment aria-selected:bg-parchment/15"
                >
                  {content}
                </button>
              ) : (
                <Link
                  to={row.result.href}
                  onClick={() => rememberSearch(row.result)}
                  className="flex min-w-0 items-center gap-2 border border-edge bg-panel px-3 py-3 hover:border-info"
                >
                  {content}
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
  // oxlint-enable jsx-a11y/prefer-tag-over-role
}
