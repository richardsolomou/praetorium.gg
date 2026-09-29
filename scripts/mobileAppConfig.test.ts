import { createRequire } from 'node:module'
import { afterEach, expect, test } from 'vitest'

const require = createRequire(import.meta.url)
const appConfig = require('../mobile/app.config.js') as () => {
  updates?: { requestHeaders?: Record<string, string> }
  plugins?: (string | [string, Record<string, unknown>])[]
}
const originalChannel = process.env.MOBILE_UPDATE_CHANNEL

afterEach(() => {
  if (originalChannel === undefined) delete process.env.MOBILE_UPDATE_CHANNEL
  else process.env.MOBILE_UPDATE_CHANNEL = originalChannel
})

test.each(['canary', 'stable'])('uses the %s update channel and production push entitlement in native builds', (channel) => {
  process.env.MOBILE_UPDATE_CHANNEL = channel

  expect(appConfig().updates?.requestHeaders?.['expo-channel-name']).toBe(channel)
  expect(appConfig().plugins).toContainEqual(['expo-notifications', { mode: 'production' }])
})

test('keeps the default app configuration outside delivery builds', () => {
  delete process.env.MOBILE_UPDATE_CHANNEL

  expect(appConfig().updates?.requestHeaders).toBeUndefined()
  expect(appConfig().plugins).toContain('expo-notifications')
})
