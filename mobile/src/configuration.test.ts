import { describe, expect, it } from 'vitest'
import appConfig from '../app.json'

describe('mobile application configuration', () => {
  it('keeps repeated PostHog source map uploads from failing a release build', () => {
    expect(appConfig.expo.plugins).toContainEqual(['posthog-react-native/expo', { skipOnConflict: true }])
  })
})
