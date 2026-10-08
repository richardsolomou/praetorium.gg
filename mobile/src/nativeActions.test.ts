import demo from '../../mobile/watch/demo-battle.json'
import { describe, expect, it, vi } from 'vitest'
import { NATIVE_BRIDGE_SCRIPT, nativePushAnswerScript, nativeWatchCapabilityScript, parseNativeActionRequest } from './nativeActions'

describe('parseNativeActionRequest', () => {
  it('accepts an account snapshot and its explicit removal', () => {
    const snapshot = { version: 1, owner: 'alice', queries: [{ key: ['me'], data: { id: 'alice' }, updatedAt: 1 }] }
    expect(parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-app-snapshot', id: 'save-1', snapshot }))).toEqual({
      kind: 'app-snapshot',
      id: 'save-1',
      snapshot,
    })
    expect(parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-app-snapshot', id: 'clear-1', snapshot: null }))).toEqual({
      kind: 'app-snapshot',
      id: 'clear-1',
      snapshot: null,
    })
  })

  it('rejects mismatched owners and private data without an owner', () => {
    for (const snapshot of [
      { version: 1, owner: 'bob', queries: [{ key: ['me'], data: { id: 'alice' }, updatedAt: 1 }] },
      { version: 1, owner: null, queries: [{ key: ['home-rosters'], data: ['Alice army'], updatedAt: 1 }] },
    ])
      expect(parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-app-snapshot', id: 'save-1', snapshot }))).toBeNull()
  })

  it('accepts an internal share link', () => {
    expect(
      parseNativeActionRequest(
        JSON.stringify({ version: 3, type: 'native-share', url: 'https://praetorium.gg/battles/abc?seat=two#turn' }),
      ),
    ).toEqual({ kind: 'share', url: 'https://praetorium.gg/battles/abc?seat=two#turn' })
  })

  it('rejects an external share link', () => {
    expect(
      parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-share', url: 'https://example.com/battles/abc' })),
    ).toBeNull()
  })

  it('accepts battle, haptic, and print actions', () => {
    expect(parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-battle-active', active: true }))).toEqual({
      kind: 'battle-active',
      active: true,
    })
    expect(parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-haptic' }))).toEqual({ kind: 'haptic' })
    expect(parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-back-gesture', enabled: true }))).toEqual({
      kind: 'back-gesture',
      enabled: true,
    })
    expect(parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-back-gesture' }))).toBeNull()
    expect(parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-print', html: '<html></html>' }))).toEqual({
      kind: 'print',
      html: '<html></html>',
    })
  })

  it('accepts supported new-window links and rejects unsafe ones', () => {
    expect(
      parseNativeActionRequest(
        JSON.stringify({ version: 3, type: 'native-open-window', url: 'https://praetorium.gg/factions/necrons/datasheets/warriors' }),
      ),
    ).toEqual({ kind: 'open-window', url: 'https://praetorium.gg/factions/necrons/datasheets/warriors' })
    expect(parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-open-window', url: 'https://example.com/rules' }))).toEqual({
      kind: 'open-window',
      url: 'https://example.com/rules',
    })
    expect(parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-open-window', url: 'javascript:alert(1)' }))).toBeNull()
  })

  it('rejects unknown bridge versions and oversized print documents', () => {
    expect(parseNativeActionRequest(JSON.stringify({ version: 2, type: 'native-haptic' }))).toBeNull()
    expect(parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-print', html: 'x'.repeat(2_000_001) }))).toBeNull()
  })

  it('accepts a push request naming its reply', () => {
    expect(parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-push', id: 'request-1', prompt: true }))).toEqual({
      kind: 'push',
      id: 'request-1',
      prompt: true,
    })
  })

  it.each([{ id: 'x', prompt: 'yes' }, { id: "'); alert(1); ('", prompt: false }, { prompt: false }])(
    'rejects a push request %j',
    (request) => {
      expect(parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-push', ...request }))).toBeNull()
    },
  )
})

describe('nativePushAnswerScript', () => {
  it('dispatches the answer to the page as data rather than code', () => {
    const dispatched: unknown[] = []
    const script = nativePushAnswerScript('request-1', { status: 'granted', token: 'ExponentPushToken["x"]', platform: 'ios' })
    // oxlint-disable-next-line typescript/no-implied-eval -- Execute the injected script the way the WebView does.
    const run = new Function('window', 'CustomEvent', script)
    run(
      { dispatchEvent: (event: { detail: unknown }) => dispatched.push(event.detail) },
      class {
        detail: unknown
        constructor(_name: string, init: { detail: unknown }) {
          this.detail = init.detail
        }
      },
    )

    expect(dispatched).toEqual([{ id: 'request-1', status: 'granted', token: 'ExponentPushToken["x"]', platform: 'ios' }])
  })
})

describe('NATIVE_BRIDGE_SCRIPT', () => {
  it('publishes only the version 3 capabilities the shell handles', () => {
    expect(NATIVE_BRIDGE_SCRIPT).toContain(
      "const capabilities = ['app-navigation', 'app-snapshot', 'back-gesture', 'battle-active', 'github-auth', 'haptic', 'notifications', 'offline-reference', 'open-window', 'print', 'share']",
    )
    expect(NATIVE_BRIDGE_SCRIPT).toContain('bridgeVersion: 3')
  })

  it('marks documents for the native application layout before they render', () => {
    expect(NATIVE_BRIDGE_SCRIPT).toContain("document.documentElement.dataset.nativeApp = 'true'")
    expect(NATIVE_BRIDGE_SCRIPT).not.toContain('dataset.nativeShell')
  })

  it('disables document zoom in the native application', () => {
    expect(NATIVE_BRIDGE_SCRIPT).toContain('maximum-scale=1, user-scalable=no')
  })

  it('waits for the document root when the WebView injects the bridge first', () => {
    let mutationCallback: (() => void) | undefined
    const disconnect = vi.fn()
    class TestMutationObserver {
      constructor(callback: () => void) {
        mutationCallback = callback
      }
      observe() {}
      disconnect() {
        disconnect()
      }
    }
    const window = { open: vi.fn(), ReactNativeWebView: { postMessage: vi.fn() } }
    const document = {
      baseURI: 'https://praetorium.gg/',
      documentElement: null as { dataset: Record<string, string> } | null,
      addEventListener: vi.fn(),
      querySelector: vi.fn(() => null),
    }
    class TestElement {
      closest() {
        return null
      }
    }
    // oxlint-disable-next-line typescript/no-implied-eval -- Execute the fixed injected script before the WebView creates its document root.
    const executeBridge = new Function('window', 'document', 'Element', 'URL', 'MutationObserver', NATIVE_BRIDGE_SCRIPT)
    executeBridge(window, document, TestElement, URL, TestMutationObserver)
    document.documentElement = { dataset: {} }
    mutationCallback!()
    expect(document.documentElement.dataset.nativeApp).toBe('true')
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('routes blank-target links and window.open through the native shell', () => {
    const messages: string[] = []
    const listeners = new Map<string, (event: Record<string, unknown>) => void>()
    const browserOpen = vi.fn()
    const anchor = { href: 'https://praetorium.gg/factions/necrons/datasheets/warriors', target: '_blank' }
    class TestElement {
      closest(selector: string) {
        return selector === 'a[target]' ? anchor : null
      }
    }
    const window = {
      open: browserOpen,
      ReactNativeWebView: { postMessage: (message: string) => messages.push(message) },
    }
    const document = {
      baseURI: 'https://praetorium.gg/rosters/abc',
      documentElement: { dataset: {} as Record<string, string> },
      addEventListener: (type: string, listener: (event: Record<string, unknown>) => void) => listeners.set(type, listener),
      querySelector: () => null,
    }
    // oxlint-disable-next-line typescript/no-implied-eval -- Execute the fixed injected script against a small WebView-shaped test harness.
    const executeBridge = new Function('window', 'document', 'Element', 'URL', NATIVE_BRIDGE_SCRIPT)
    executeBridge(window, document, TestElement, URL)
    expect(document.documentElement.dataset.nativeApp).toBe('true')

    const nativeOpen = window.open as unknown as (url: string, target?: string) => null
    expect(nativeOpen('/rosters/abc?print=true', '_blank')).toBeNull()
    expect(JSON.parse(messages[0]!)).toEqual({
      version: 3,
      type: 'native-open-window',
      url: 'https://praetorium.gg/rosters/abc?print=true',
    })
    expect(browserOpen).not.toHaveBeenCalled()

    const click = {
      defaultPrevented: false,
      button: 0,
      target: new TestElement(),
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    }
    listeners.get('click')!(click)
    expect(JSON.parse(messages[1]!)).toEqual({ version: 3, type: 'native-open-window', url: anchor.href })
    expect(click.preventDefault).toHaveBeenCalledOnce()
    expect(click.stopImmediatePropagation).toHaveBeenCalledOnce()
  })

  it('removes executable embedded content before printing', () => {
    expect(NATIVE_BRIDGE_SCRIPT).toContain("querySelectorAll('script, iframe')")
  })
})

describe('watch bridge', () => {
  it('updates watch availability without duplicating or removing other capabilities', () => {
    const events: unknown[] = []
    const window = {
      PraetoriumNative: { bridgeVersion: 3, capabilities: ['share', 'watch-battle'] },
      dispatchEvent: (event: unknown) => events.push(event),
    }
    for (const enabled of [true, false]) {
      // oxlint-disable-next-line typescript/no-implied-eval -- Execute the fixed capability update as the WebView does.
      new Function('window', 'CustomEvent', nativeWatchCapabilityScript(enabled))(
        window,
        class {
          constructor(readonly type: string) {}
        },
      )
    }
    expect({ capabilities: window.PraetoriumNative.capabilities, events }).toEqual({
      capabilities: ['share'],
      events: [{ type: 'praetorium-native-capabilities' }, { type: 'praetorium-native-capabilities' }],
    })
  })
  it('accepts a bounded live battle snapshot', () => {
    expect(parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-watch-battle', snapshot: demo }))).toEqual({
      kind: 'watch-battle',
      snapshot: demo,
    })
  })

  it('clears the watch when leaving a live battle', () => {
    expect(parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-watch-battle', snapshot: null }))).toEqual({
      kind: 'watch-battle',
      snapshot: null,
    })
  })
  it('rejects malformed watch snapshots', () => {
    expect(parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-watch-battle', snapshot: { version: 1 } }))).toBeNull()
  })
})
