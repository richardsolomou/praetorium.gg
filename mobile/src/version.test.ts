import { describe, expect, it } from 'vitest'
import appConfig from '../app.json'
import packageMetadata from '../package.json'
import { NATIVE_APP_VERSION, NATIVE_USER_AGENT } from './version'

describe('native application version', () => {
  it('keeps the store version, package version, and user agent in step', () => {
    expect({
      appConfig: appConfig.expo.version,
      packageMetadata: packageMetadata.version,
      userAgent: NATIVE_USER_AGENT,
    }).toEqual({
      appConfig: NATIVE_APP_VERSION,
      packageMetadata: NATIVE_APP_VERSION,
      userAgent: `PraetoriumNative/${NATIVE_APP_VERSION}`,
    })
  })
})
