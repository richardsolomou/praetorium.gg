import { describe, expect, it } from 'vitest'
import {
  appShellRenderChanged,
  appShellRenderState,
  authDeliveryFailed,
  authDeliverySucceeded,
  authReceived,
  drainAppShell,
  initialAppShellState,
  initialUrlReceived,
  rendererTerminated,
  warmUrlReceived,
  webLoadFailed,
  webLoadSucceeded,
  webLoadStarted,
  webNavigationChanged,
} from './appShellState'

const auth = {
  kind: 'success' as const,
  action: 'sign-in' as const,
  provider: 'google' as const,
  next: '/lists',
  token: '0123456789abcdef',
}

describe('application shell delivery', () => {
  it('lets a warm link win while the initial URL lookup is pending', () => {
    const warm = warmUrlReceived(initialAppShellState(), 'https://praetorium.gg/battles/42?tab=log#latest')

    expect(initialUrlReceived(warm, 'https://praetorium.gg/lists').sourceUrl).toBe('https://praetorium.gg/battles/42?tab=log#latest')
  })

  it('delivers a queued navigation after the web application loads', () => {
    const loaded = initialUrlReceived(initialAppShellState(), null)
    const queued = warmUrlReceived(loaded, 'https://praetorium.gg/lists?mode=saved#current')

    expect(drainAppShell(webLoadSucceeded(queued, 'https://praetorium.gg')).command).toEqual({
      kind: 'navigation',
      url: 'https://praetorium.gg/lists?mode=saved#current',
    })
  })

  it('does not drain queued work after a failed load', () => {
    const loaded = initialUrlReceived(initialAppShellState(), null)
    const queued = warmUrlReceived(loaded, 'https://praetorium.gg/lists')
    const delivering = drainAppShell(webLoadSucceeded(queued, 'https://praetorium.gg')).state

    expect(drainAppShell(webLoadFailed(delivering))).toEqual({
      state: expect.objectContaining({ ready: false, pendingNavigation: 'https://praetorium.gg/lists', delivering: null }),
      command: null,
    })
  })

  it('delivers authentication before queued navigation', () => {
    const loaded = initialUrlReceived(initialAppShellState(), null)
    const queued = authReceived(warmUrlReceived(loaded, 'https://praetorium.gg/lists'), auth)
    const authDelivery = drainAppShell(webLoadSucceeded(queued, 'https://praetorium.gg')).state

    expect({ first: authDelivery.delivering, afterFailure: drainAppShell(authDeliveryFailed(authDelivery)).command }).toEqual({
      first: { kind: 'auth', callback: auth },
      afterFailure: { kind: 'navigation', url: 'https://praetorium.gg/lists' },
    })
  })

  it('remounts the last trusted URL and restores interrupted delivery after renderer termination', () => {
    const loaded = webLoadSucceeded(
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
      renderKey: 1,
    })
  })

  it('recovers authenticated navigation without replaying a consumed token', () => {
    const loaded = webLoadSucceeded(initialUrlReceived(initialAppShellState(), null), 'https://praetorium.gg')
    const deliveringAuth = drainAppShell(authReceived(loaded, auth)).state
    const exchanged = authDeliverySucceeded(deliveringAuth)

    expect(rendererTerminated(exchanged)).toMatchObject({
      pendingAuth: null,
      pendingNavigation: 'https://praetorium.gg/lists',
      delivering: null,
    })
  })

  it('does not change the controlled source after ordinary internal navigation', () => {
    const loaded = webLoadSucceeded(initialUrlReceived(initialAppShellState(), null), 'https://praetorium.gg')
    const navigated = webNavigationChanged(loaded, 'https://praetorium.gg/lists')
    const transitioned = webLoadStarted(navigated)

    expect({ changed: appShellRenderChanged(loaded, transitioned), rendered: appShellRenderState(transitioned) }).toEqual({
      changed: false,
      rendered: appShellRenderState(loaded),
    })
  })
})
