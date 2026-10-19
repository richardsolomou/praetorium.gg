import {
  elementScroll,
  observeElementOffset,
  observeElementRect,
  Virtualizer,
  type VirtualItem,
  type VirtualizerOptions,
} from '@tanstack/react-virtual'
import { useLayoutEffect, useState, useSyncExternalStore } from 'react'

type Options = Omit<VirtualizerOptions<HTMLDivElement, Element>, 'observeElementRect' | 'observeElementOffset' | 'scrollToFn' | 'onChange'>
type View = { items: VirtualItem[]; totalSize: number }

const sameView = (a: View, b: View) =>
  a.totalSize === b.totalSize &&
  a.items.length === b.items.length &&
  a.items.every((item, index) => {
    const other = b.items[index]!
    return item.key === other.key && item.start === other.start && item.size === other.size
  })

function virtualRows(options: Options) {
  const listeners = new Set<() => void>()
  const resolve = (next: Options) => ({
    observeElementRect,
    observeElementOffset,
    scrollToFn: elementScroll,
    ...next,
    // Measurement updates can resize the observed viewport; commit them outside the observer's delivery cycle.
    useAnimationFrameWithResizeObserver: true,
    onChange: refresh,
  })
  const virtualizer = new Virtualizer<HTMLDivElement, Element>(resolve(options))
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
    update: (next: Options) => {
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
export function useVirtualRows(options: Options) {
  const [rows] = useState(() => virtualRows(options))
  const view = useSyncExternalStore(rows.subscribe, rows.read, rows.read)
  useLayoutEffect(() => rows.virtualizer._didMount(), [rows])
  useLayoutEffect(() => rows.update(options))
  // A list that just shrank still holds the last commit's rows until the layout effect replaces them before paint.
  return { items: view.items.filter((item) => item.index < options.count), totalSize: view.totalSize, virtualizer: rows.virtualizer }
}
