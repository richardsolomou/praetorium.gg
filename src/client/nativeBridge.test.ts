import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  NATIVE_PUSH_EVENT,
  requestNativeHaptic,
  requestNativePush,
  setNativeAccount,
  setNativeAccountMenuOpen,
  setNativeBattleActive,
  setNativeHistoryBack,
  setNativeNavigation,
  shareLink,
} from './nativeBridge'

describe('native application actions', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends declared actions to a version 3 shell', async () => {
    const postMessage = vi.fn()
    vi.stubGlobal('window', {
      PraetoriumNative: {
        bridgeVersion: 3,
        capabilities: ['account', 'app-navigation', 'back-gesture', 'battle-active', 'haptic', 'share'],
      },
      ReactNativeWebView: { postMessage },
    })

    expect(setNativeBattleActive(true)).toBe(true)
    expect(setNativeAccount('Rogal Dorn', 'https://cdn.example/dorn.webp')).toBe(true)
    expect(setNativeAccountMenuOpen(true)).toBe(true)
    expect(setNativeNavigation('Roster', '/rosters', true)).toBe(true)
    expect(setNativeHistoryBack(true)).toBe(true)
    expect(requestNativeHaptic()).toBe(true)
    await expect(shareLink('https://praetorium.gg/battles/abc', 'Battle')).resolves.toBe('shared')
    expect(postMessage.mock.calls.map(([message]) => JSON.parse(message))).toEqual([
      { version: 3, type: 'native-battle-active', active: true },
      { version: 3, type: 'native-account', name: 'Rogal Dorn', image: 'https://cdn.example/dorn.webp' },
      { version: 3, type: 'native-account-menu', open: true },
      { version: 3, type: 'native-navigation', title: 'Roster', backUrl: '/rosters', preferHistory: true },
      { version: 3, type: 'native-back-gesture', enabled: true },
      { version: 3, type: 'native-haptic' },
      { version: 3, type: 'native-share', url: 'https://praetorium.gg/battles/abc', title: 'Battle' },
    ])
  })

  it('falls back to the clipboard outside a compatible shell', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('window', { navigator: { clipboard: { writeText } } })
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    await expect(shareLink('https://praetorium.gg/rosters/abc')).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith('https://praetorium.gg/rosters/abc')
  })
})

describe('native push requests', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  /** A shell that answers each request by dispatching `reply(request)`, as the injected script does. */
  function shell(reply: (request: { id: string; prompt: boolean }) => unknown) {
    const events = new EventTarget()
    const postMessage = vi.fn((message: string) => {
      const request = JSON.parse(message) as { id: string; prompt: boolean }
      const detail = reply(request)
      if (detail) queueMicrotask(() => events.dispatchEvent(new CustomEvent(NATIVE_PUSH_EVENT, { detail })))
    })
    vi.stubGlobal('window', {
      PraetoriumNative: { bridgeVersion: 3, capabilities: ['notifications'] },
      ReactNativeWebView: { postMessage },
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    })
    return postMessage
  }

  it('asks the shell without the system prompt unless told to prompt', async () => {
    const postMessage = shell(({ id }) => ({ id, status: 'undetermined' }))

    await requestNativePush(false)

    expect(JSON.parse(postMessage.mock.calls[0]![0])).toMatchObject({ version: 3, type: 'native-push', prompt: false })
  })

  it('resolves with the device token the shell answers with', async () => {
    shell(({ id }) => ({ id, status: 'granted', token: 'ExponentPushToken[device]', platform: 'ios' }))

    await expect(requestNativePush(true)).resolves.toEqual({ status: 'granted', token: 'ExponentPushToken[device]', platform: 'ios' })
  })

  it('ignores an answer to another request and gives up after the timeout', async () => {
    vi.useFakeTimers()
    shell(() => ({ id: 'someone-else', status: 'granted', token: 'ExponentPushToken[other]', platform: 'ios' }))

    const answer = requestNativePush(false, 1_000)
    await vi.advanceTimersByTimeAsync(1_000)

    await expect(answer).resolves.toBeNull()
  })

  it('answers nothing in a shell without the notifications capability', async () => {
    vi.stubGlobal('window', {
      PraetoriumNative: { bridgeVersion: 3, capabilities: ['share'] },
      ReactNativeWebView: { postMessage: vi.fn() },
    })

    await expect(requestNativePush(true)).resolves.toBeNull()
  })
})
