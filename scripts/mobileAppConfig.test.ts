import { createRequire } from 'node:module'
import { afterEach, expect, test } from 'vitest'

const require = createRequire(import.meta.url)
const appConfig = require('../mobile/app.config.js') as () => {
  updates?: { requestHeaders?: Record<string, string> }
}
const originalChannel = process.env.MOBILE_UPDATE_CHANNEL

afterEach(() => {
  if (originalChannel === undefined) delete process.env.MOBILE_UPDATE_CHANNEL
  else process.env.MOBILE_UPDATE_CHANNEL = originalChannel
})

test('uses the selected update channel in native builds', () => {
  process.env.MOBILE_UPDATE_CHANNEL = 'canary'

  expect(appConfig().updates?.requestHeaders?.['expo-channel-name']).toBe('canary')
})

test('keeps the default app configuration outside delivery builds', () => {
  delete process.env.MOBILE_UPDATE_CHANNEL

  expect(appConfig().updates?.requestHeaders).toBeUndefined()
})
