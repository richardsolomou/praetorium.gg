import { afterEach, describe, expect, it, vi } from 'vitest'
import { restoreNativeTabScroll } from './nativeTabScroll'

type Listener = () => void

function stubBrowser() {
  let scrollY = 0
  const listeners = new Map<string, Listener>()
  const scrollTo = vi.fn((_left: number, top: number) => {
    scrollY = top
  })
  vi.stubGlobal('window', {
    get scrollY() {
      return scrollY
    },
    scrollTo,
    setTimeout,
    clearTimeout,
    addEventListener: (event: string, listener: Listener) => listeners.set(event, listener),
    removeEventListener: (event: string, listener: Listener) => {
      if (listeners.get(event) === listener) listeners.delete(event)
    },
  })
  return { listeners, scrollTo, setScrollY: (top: number) => (scrollY = top) }
}

describe('native tab scroll restoration', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('restores again after the router resets the document scroll', () => {
    vi.useFakeTimers()
    const browser = stubBrowser()
    let loadout: { scrollTop: number; scrollTo: (left: number, top: number) => void } | null = null
    vi.stubGlobal('document', { querySelector: () => loadout })

    restoreNativeTabScroll(120, { loadout: 360 }, { loadout: '[data-pane="loadout"]' })
    expect(browser.scrollTo).toHaveBeenCalledWith(0, 120)

    browser.setScrollY(0)
    loadout = {
      scrollTop: 0,
      scrollTo(_left, top) {
        this.scrollTop = top
      },
    }
    vi.advanceTimersByTime(0)

    expect(browser.scrollTo).toHaveBeenCalledTimes(2)
    expect(loadout.scrollTop).toBe(360)
  })

  it('stops retries when the player interacts', () => {
    vi.useFakeTimers()
    const browser = stubBrowser()
    const loadout = { scrollTop: 0, scrollTo: vi.fn() }
    let ready = false
    vi.stubGlobal('document', { querySelector: () => (ready ? loadout : null) })

    restoreNativeTabScroll(0, { loadout: 360 }, { loadout: '[data-pane="loadout"]' })
    browser.listeners.get('touchstart')?.()
    ready = true
    vi.runAllTimers()

    expect(loadout.scrollTo).not.toHaveBeenCalled()
    expect(browser.listeners.size).toBe(0)
  })
})
