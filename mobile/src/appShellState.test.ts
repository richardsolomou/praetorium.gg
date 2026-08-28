import { describe, expect, it } from 'vitest'
import {
  appShellRenderChanged,
  appShellRenderState,
  authDeliveryFailed,
  authDeliverySucceeded,
  authReceived,
  confirmWebLoadSucceeded,
  drainAppShell,
  initialAppShellState,
  initialUrlReceived,
  rendererTerminated,
  warmUrlReceived,
  webLoadFailed,
  webLoadFinished,
  webLoadStarted,
  webNavigationChanged,
} from './appShellState'

const auth = {
  kind: 'success' as const,
  action: 'sign-in' as const,
  provider: 'google' as const,
  next: '/lists',
  id: 'exchange-id-123456789012345678901',
  challenge: 'c'.repeat(43),
  verifier: 'v'.repeat(43),
  token: '0123456789abcdef',
}

function successfulLoad(state: ReturnType<typeof initialAppShellState>, url: string) {
  return confirmWebLoadSucceeded(webLoadFinished(webLoadStarted(state), url))
}

describe('application shell delivery', () => {
  it('lets a warm link win while the initial URL lookup is pending', () => {
    const warm = warmUrlReceived(initialAppShellState(), 'https://praetorium.gg/battles/42?tab=log#latest')

    expect(initialUrlReceived(warm, 'https://praetorium.gg/lists').sourceUrl).toBe('https://praetorium.gg/battles/42?tab=log#latest')
  })

  it('delivers a queued navigation after the web application loads', () => {
    const loaded = initialUrlReceived(initialAppShellState(), null)
    const queued = warmUrlReceived(loaded, 'https://praetorium.gg/lists?mode=saved#current')

    expect(drainAppShell(successfulLoad(queued, 'https://praetorium.gg')).command).toEqual({
      kind: 'navigation',
      url: 'https://praetorium.gg/lists?mode=saved#current',
    })
  })

  it('does not drain queued work after a failed load', () => {
    const loaded = initialUrlReceived(initialAppShellState(), null)
    const queued = warmUrlReceived(loaded, 'https://praetorium.gg/lists')
    const delivering = drainAppShell(successfulLoad(queued, 'https://praetorium.gg')).state

    expect(drainAppShell(webLoadFailed(delivering))).toEqual({
      state: expect.objectContaining({ ready: false, pendingNavigation: 'https://praetorium.gg/lists', delivering: null }),
      command: null,
    })
  })

  it('delivers authentication before queued navigation', () => {
    const loaded = initialUrlReceived(initialAppShellState(), null)
    const queued = authReceived(warmUrlReceived(loaded, 'https://praetorium.gg/lists'), auth)
    const authDelivery = drainAppShell(successfulLoad(queued, 'https://praetorium.gg')).state

    expect({ first: authDelivery.delivering, afterFailure: drainAppShell(authDeliveryFailed(authDelivery, auth.id)).command }).toEqual({
      first: { kind: 'auth', callback: auth },
      afterFailure: { kind: 'navigation', url: 'https://praetorium.gg/lists' },
    })
  })

  it('remounts the last trusted URL and restores interrupted delivery after renderer termination', () => {
    const loaded = successfulLoad(
      initialUrlReceived(initialAppShellState(), 'https://praetorium.gg/battles/42'),
      'https://praetorium.gg/battles/42',
    )
    const queued = warmUrlReceived(loaded, 'https://praetorium.gg/lists')
    const delivering = drainAppShell(queued).state

    expect(rendererTerminated(delivering)).toMatchObject({
      sourceUrl: 'https://praetorium.gg/battles/42',
      pendingNavigation: 'https://praetorium.gg/lists',
      delivering: null,
      ready: false,
      loadStarted: false,
      renderKey: 1,
    })
  })

  it('ignores a stale finish from a terminated renderer', () => {
    const loaded = successfulLoad(initialUrlReceived(initialAppShellState(), null), 'https://praetorium.gg')
    const terminated = rendererTerminated(loaded)

    expect(confirmWebLoadSucceeded(webLoadFinished(terminated, 'https://praetorium.gg')).ready).toBe(false)
  })

  it('clears authenticated delivery after native acknowledgement', () => {
    const loaded = successfulLoad(initialUrlReceived(initialAppShellState(), null), 'https://praetorium.gg')
    const deliveringAuth = drainAppShell(authReceived(loaded, auth)).state

    expect(authDeliverySucceeded(deliveringAuth, auth.id).delivering).toBeNull()
    expect(authDeliverySucceeded(deliveringAuth, 'stale-exchange').delivering).toEqual({ kind: 'auth', callback: auth })
  })

  it('does not change the controlled source after ordinary internal navigation', () => {
    const loaded = successfulLoad(initialUrlReceived(initialAppShellState(), null), 'https://praetorium.gg')
    const navigated = webNavigationChanged(loaded, 'https://praetorium.gg/lists')
    const transitioned = webLoadStarted(navigated)

    expect({ changed: appShellRenderChanged(loaded, transitioned), rendered: appShellRenderState(transitioned) }).toEqual({
      changed: false,
      rendered: appShellRenderState(loaded),
    })
  })

  it('does not deliver or discard queued work when Android reports finish before error', () => {
    const loading = webLoadStarted(initialUrlReceived(initialAppShellState(), null))
    const queued = authReceived(warmUrlReceived(loading, 'https://praetorium.gg/battles/42'), auth)
    const errored = webLoadFailed(webLoadFinished(queued, 'https://praetorium.gg'))
    const deferred = drainAppShell(confirmWebLoadSucceeded(errored))

    expect(deferred).toEqual({
      state: expect.objectContaining({
        ready: false,
        pendingAuth: auth,
        pendingNavigation: 'https://praetorium.gg/battles/42',
      }),
      command: null,
    })
  })

  it('does not deliver or discard queued work when an HTTP error precedes finish', () => {
    const loading = webLoadStarted(initialUrlReceived(initialAppShellState(), null))
    const queued = authReceived(warmUrlReceived(loading, 'https://praetorium.gg/battles/42'), auth)
    const finished = webLoadFinished(webLoadFailed(queued), 'https://praetorium.gg')
    const deferred = drainAppShell(confirmWebLoadSucceeded(finished))

    expect(deferred).toEqual({
      state: expect.objectContaining({
        ready: false,
        loadFailed: true,
        pendingAuth: auth,
        pendingNavigation: 'https://praetorium.gg/battles/42',
      }),
      command: null,
    })
  })

  it('preserves auth that renderer termination interrupts before delivery', () => {
    const pending = authReceived(initialUrlReceived(initialAppShellState(), null), auth)

    expect(rendererTerminated(pending)).toMatchObject({ pendingAuth: auth })
  })

  it('retries the same exchange after renderer termination', () => {
    const loaded = successfulLoad(initialUrlReceived(initialAppShellState(), null), 'https://praetorium.gg')
    const deliveringAuth = drainAppShell(authReceived(loaded, auth)).state
    const recovered = rendererTerminated(deliveringAuth)
    const remounted = successfulLoad(recovered, 'https://praetorium.gg')
    expect(drainAppShell(remounted).command).toEqual({ kind: 'auth', callback: auth })
  })

  it('keeps queued navigation behind a retrying exchange', () => {
    const loaded = successfulLoad(initialUrlReceived(initialAppShellState(), null), 'https://praetorium.gg')
    const deliveringAuth = drainAppShell(authReceived(loaded, auth)).state
    const withWarmLink = warmUrlReceived(deliveringAuth, 'https://praetorium.gg/battles/42')
    const recovered = successfulLoad(rendererTerminated(withWarmLink), 'https://praetorium.gg')
    const retry = drainAppShell(recovered).state
    const continued = drainAppShell(authDeliverySucceeded(retry, auth.id))

    expect({ retry: retry.delivering, continued: continued.command }).toEqual({
      retry: { kind: 'auth', callback: auth },
      continued: { kind: 'navigation', url: 'https://praetorium.gg/battles/42' },
    })
  })
})
