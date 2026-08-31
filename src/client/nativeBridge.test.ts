import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestNativeHaptic, setNativeBattleActive, shareLink } from './nativeBridge'

describe('native application actions', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends declared actions to a version 3 shell', async () => {
    const postMessage = vi.fn()
    vi.stubGlobal('window', {
      PraetoriumNative: { bridgeVersion: 3, capabilities: ['battle-active', 'haptic', 'share'] },
      ReactNativeWebView: { postMessage },
    })

    expect(setNativeBattleActive(true)).toBe(true)
    expect(requestNativeHaptic()).toBe(true)
    await expect(shareLink('https://praetorium.gg/battles/abc', 'Battle')).resolves.toBe('shared')
    expect(postMessage.mock.calls.map(([message]) => JSON.parse(message))).toEqual([
      { version: 3, type: 'native-battle-active', active: true },
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
