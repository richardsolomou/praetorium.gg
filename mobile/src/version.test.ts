import { describe, expect, it, vi } from 'vitest'
import appConfig from '../app.json'
import packageMetadata from '../package.json'

vi.mock('expo-application', () => ({ nativeApplicationVersion: '9.8.7' }))

import { NATIVE_USER_AGENT } from './version'

describe('native application version', () => {
  it('keeps the store version and package version in step', () => {
    expect(packageMetadata.version).toBe(appConfig.expo.version)
  })

  it('reports the version embedded in the installed binary', () => {
    expect(NATIVE_USER_AGENT).toBe('PraetoriumNative/9.8.7')
  })

  it('falls back to the configured version outside an installed binary', async () => {
    vi.resetModules()
    vi.doMock('expo-application', () => ({ nativeApplicationVersion: null }))

    const { NATIVE_USER_AGENT: fallbackUserAgent } = await import('./version')

    expect(fallbackUserAgent).toBe(`PraetoriumNative/${appConfig.expo.version}`)
  })
})
