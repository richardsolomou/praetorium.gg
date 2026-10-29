import { afterEach, expect, it, vi } from 'vitest'

const hooks = vi.hoisted(() => ({ effects: [] as (() => unknown)[], changed: vi.fn() }))
vi.mock('react', () => ({
  useState: (create: () => unknown) => [create()],
  useLayoutEffect: (effect: () => unknown) => hooks.effects.push(effect),
  useEffect: vi.fn(),
  useSyncExternalStore: (subscribe: (changed: () => void) => void, read: () => unknown) => {
    subscribe(hooks.changed)
    return read()
  },
}))

import { useVirtualRows } from './useVirtualRows'

afterEach(() => {
  hooks.effects.length = 0
  hooks.changed.mockClear()
  vi.unstubAllGlobals()
})

for (const target of ['viewport', 'row'] as const) {
  it(`applies ${target} measurements after ResizeObserver delivery finishes`, () => {
    const observers: { callback: ResizeObserverCallback; targets: Element[] }[] = []
    const frames: FrameRequestCallback[] = []
    class Observer {
      targets: Element[] = []
      constructor(callback: ResizeObserverCallback) {
        observers.push({ callback, targets: this.targets })
      }
      observe(element: Element) {
        this.targets.push(element)
      }
      unobserve() {}
      disconnect() {}
    }
    const view = { ResizeObserver: Observer, requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback) }
    vi.stubGlobal('requestAnimationFrame', view.requestAnimationFrame)
    const scroller = {
      ownerDocument: { defaultView: view },
      clientWidth: 300,
      clientHeight: 60,
      scrollTop: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      scrollTo: vi.fn(),
    } as unknown as HTMLDivElement
    const { virtualizer } = useVirtualRows({ count: 10, getScrollElement: () => scroller, estimateSize: () => 20, overscan: 0 })
    for (const effect of hooks.effects) effect()
    const row = { getAttribute: () => '0', offsetHeight: 20, isConnected: true } as unknown as Element
    virtualizer.measureElement(row)
    hooks.changed.mockClear()
    const element = target === 'viewport' ? scroller : row
    const observer = observers.find((candidate) => candidate.targets.includes(element))!
    // The viewport is read from client dimensions; rows are read from the observer entry.
    if (target === 'viewport') Object.assign(scroller, { clientHeight: 120 })
    observer.callback(
      [
        { target: element, borderBoxSize: [{ inlineSize: 300, blockSize: target === 'viewport' ? 120 : 40 }] },
      ] as unknown as ResizeObserverEntry[],
      {} as ResizeObserver,
    )
    expect(hooks.changed).not.toHaveBeenCalled()
    for (const frame of frames) frame(0)
    expect(hooks.changed).toHaveBeenCalledOnce()
  })
}
