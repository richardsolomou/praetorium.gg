import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasNativeAuthBridge, requestNativeAuth } from './nativeAuth'

describe('native auth web bridge', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('does not send messages to an older shell without a bridge version', () => {
    const postMessage = vi.fn()
    vi.stubGlobal('window', { ReactNativeWebView: { postMessage } })

    expect(hasNativeAuthBridge()).toBe(false)
    expect(requestNativeAuth({ action: 'sign-in', provider: 'google', next: '/rosters' })).toBe(false)
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('sends a versioned message to a compatible shell', () => {
    const postMessage = vi.fn()
    vi.stubGlobal('window', { PraetoriumNative: { bridgeVersion: 1 }, ReactNativeWebView: { postMessage } })

    expect(requestNativeAuth({ action: 'sign-in', provider: 'discord', next: '/profile' })).toBe(true)
    expect(JSON.parse(postMessage.mock.calls[0]![0])).toEqual({
      version: 1,
      type: 'native-auth',
      action: 'sign-in',
      provider: 'discord',
      next: '/profile',
    })
  })
})
