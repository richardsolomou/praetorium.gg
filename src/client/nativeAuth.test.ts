import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient } from '@tanstack/react-query'
import { writesPending } from './pendingWrites'
import { canUseGithubAuth, hasNativeAuthBridge, nativeAuthExchange, requestNativeAuth, useGithubAuthAvailability } from './nativeAuth'

describe('native auth web bridge', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('offers GitHub only where its authentication handoff is supported', () => {
    vi.stubGlobal('window', undefined)
    const web = canUseGithubAuth()
    vi.stubGlobal('window', { PraetoriumNative: { bridgeVersion: 3, capabilities: ['account'] }, ReactNativeWebView: {} })
    const olderShell = canUseGithubAuth()
    vi.stubGlobal('window', { PraetoriumNative: { bridgeVersion: 3, capabilities: ['github-auth'] }, ReactNativeWebView: {} })

    expect([web, olderShell, canUseGithubAuth()]).toEqual([true, false, true])
  })

  it('keeps the server frame stable before an older shell is detected', () => {
    vi.stubGlobal('window', { PraetoriumNative: { bridgeVersion: 3, capabilities: ['account'] }, ReactNativeWebView: {} })
    const GithubOption = () => (useGithubAuthAvailability() ? 'GitHub' : 'Unavailable')

    expect(renderToString(createElement(GithubOption))).toBe('GitHub')
  })

  it('does not send messages to an older shell without a bridge version', async () => {
    const postMessage = vi.fn()
    vi.stubGlobal('window', { ReactNativeWebView: { postMessage } })

    expect(hasNativeAuthBridge()).toBe(false)
    await expect(requestNativeAuth({ action: 'sign-in', provider: 'google', next: '/rosters' })).resolves.toBe(false)
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('sends a versioned message to a compatible shell', async () => {
    const postMessage = vi.fn()
    vi.stubGlobal('window', { PraetoriumNative: { bridgeVersion: 1 }, ReactNativeWebView: { postMessage } })

    await expect(requestNativeAuth({ action: 'sign-in', provider: 'discord', next: '/profile' })).resolves.toBe(true)
    expect(JSON.parse(postMessage.mock.calls[0]![0])).toEqual({
      version: 1,
      type: 'native-auth',
      action: 'sign-in',
      provider: 'discord',
      next: '/profile',
    })
  })

  it('uses a per-flow proof with the retryable authentication protocol', async () => {
    const postMessage = vi.fn()
    vi.stubGlobal('window', { PraetoriumNative: { bridgeVersion: 2 }, ReactNativeWebView: { postMessage } })

    await expect(requestNativeAuth({ action: 'sign-in', provider: 'google', next: '/rosters' })).resolves.toBe(true)
    const message = JSON.parse(postMessage.mock.calls[0]![0]) as { version: number; type: string; challenge: string; verifier: string }
    expect(message).toMatchObject({ version: 2, type: 'native-auth' })
    expect(message.challenge).toHaveLength(43)
    expect(message.verifier).toHaveLength(43)
    expect(message.challenge).not.toBe(message.verifier)
  })

  it('keeps the retryable authentication protocol in the version 3 shell', async () => {
    const postMessage = vi.fn()
    vi.stubGlobal('window', { PraetoriumNative: { bridgeVersion: 3 }, ReactNativeWebView: { postMessage } })

    await expect(requestNativeAuth({ action: 'sign-in', provider: 'apple', next: '/rosters' })).resolves.toBe(true)
    const message = JSON.parse(postMessage.mock.calls[0]![0]) as { version: number; provider: string; challenge: string; verifier: string }
    expect(message).toMatchObject({ version: 3, provider: 'apple' })
    expect(message.challenge).toHaveLength(43)
    expect(message.verifier).toHaveLength(43)
  })
})

it('holds automatic reloads while the native sign-in token is requested', async () => {
  let answer!: () => void
  vi.stubGlobal('fetch', () => new Promise<Response>((resolve) => (answer = () => resolve(Response.json({ id: 'id', token: 'token' })))))
  const exchanging = nativeAuthExchange({ action: 'sign-in', challenge: 'challenge', provider: 'google', next: '/rosters' })
  expect(writesPending(new QueryClient())).toBe(true)
  answer()
  await exchanging
  vi.unstubAllGlobals()
})
