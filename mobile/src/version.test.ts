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
})
