import {
  elementScroll,
  observeElementOffset,
  observeElementRect,
  observeWindowOffset,
  observeWindowRect,
  Virtualizer,
  type VirtualItem,
  type VirtualizerOptions,
  windowScroll,
} from '@tanstack/react-virtual'
import { type RefObject, useLayoutEffect, useState, useSyncExternalStore } from 'react'

type Scrolling = 'observeElementRect' | 'observeElementOffset' | 'scrollToFn'
type Options<Scroller extends Element | Window> = Omit<VirtualizerOptions<Scroller, Element>, Scrolling | 'onChange'>
type View = { items: VirtualItem[]; totalSize: number }

const ELEMENT: Pick<VirtualizerOptions<HTMLDivElement, Element>, Scrolling> = {
  observeElementRect,
  observeElementOffset,
  scrollToFn: elementScroll,
}
const WINDOW: Pick<VirtualizerOptions<Window, Element>, Scrolling> = {
  observeElementRect: observeWindowRect,
  observeElementOffset: observeWindowOffset,
  scrollToFn: windowScroll,
}

const sameView = (a: View, b: View) =>
  a.totalSize === b.totalSize &&
  a.items.length === b.items.length &&
  a.items.every((item, index) => {
    const other = b.items[index]!
    return item.key === other.key && item.start === other.start && item.size === other.size
  })

function virtualRows<Scroller extends Element | Window>(
  scrolling: Pick<VirtualizerOptions<Scroller, Element>, Scrolling>,
  options: Options<Scroller>,
) {
  const listeners = new Set<() => void>()
  const resolve = (next: Options<Scroller>) => ({
    ...scrolling,
    ...next,
    // Measurement updates can resize the observed viewport; commit them outside the observer's delivery cycle.
    useAnimationFrameWithResizeObserver: true,
    onChange: refresh,
  })
  const virtualizer = new Virtualizer<Scroller, Element>(resolve(options))
  let view: View = { items: virtualizer.getVirtualItems(), totalSize: virtualizer.getTotalSize() }
  function refresh() {
    const next = { items: virtualizer.getVirtualItems(), totalSize: virtualizer.getTotalSize() }
    if (sameView(view, next)) return
    view = next
    for (const listener of listeners) listener()
  }
  return {
    virtualizer,
    read: () => view,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    update: (next: Options<Scroller>) => {
      virtualizer.setOptions(resolve(next))
      virtualizer._willUpdate()
      refresh()
    },
  }
}

/**
 * TanStack Virtual's `useVirtualizer` hands render one mutable instance whose getters change behind a stable
 * reference, which memoization cannot see. This keeps the instance in an external store and renders from an
 * immutable snapshot of the visible rows, replaced after each commit and whenever the instance reports a scroll or
 * measurement. The instance is returned only for commands such as `scrollToIndex` and `measureElement`.
 */
function useRows<Scroller extends Element | Window>(
  scrolling: Pick<VirtualizerOptions<Scroller, Element>, Scrolling>,
  options: Options<Scroller>,
) {
  const [rows] = useState(() => virtualRows(scrolling, options))
  const view = useSyncExternalStore(rows.subscribe, rows.read, rows.read)
  useLayoutEffect(() => rows.virtualizer._didMount(), [rows])
  useLayoutEffect(() => rows.update(options))
  // A list that just shrank still holds the last commit's rows until the layout effect replaces them before paint.
  return { items: view.items.filter((item) => item.index < options.count), totalSize: view.totalSize, virtualizer: rows.virtualizer }
}

/** Rows drawn only as far as their own scroll container shows them. */
export function useVirtualRows(options: Options<HTMLDivElement>) {
  return useRows(ELEMENT, options)
}

/** Rows drawn only as far as the page scrolls, for a list that sits in the page rather than in a scroll container. */
export function useWindowRows({
  list,
  ...options
}: Omit<Options<Window>, 'getScrollElement' | 'scrollMargin'> & { list: RefObject<HTMLElement | null> }) {
  const [scrollMargin, setScrollMargin] = useState(0)
  // Anything above the list that grows or shrinks moves it down the page, and every such change resizes the document.
  useLayoutEffect(() => {
    const measure = () => {
      if (list.current) setScrollMargin(list.current.getBoundingClientRect().top + window.scrollY)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(document.documentElement)
    return () => observer.disconnect()
  }, [list])
  return useRows(WINDOW, { ...options, scrollMargin, getScrollElement: () => (typeof window === 'undefined' ? null : window) })
}
