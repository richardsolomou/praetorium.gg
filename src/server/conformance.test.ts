import { describe, expect, it } from 'vitest'
import { POSTHOG_BROWSER_OPTIONS } from '../posthog'

describe('shared infrastructure conformance', () => {
  it('masks authentication tokens in browser telemetry URLs', () => {
    expect(POSTHOG_BROWSER_OPTIONS).toMatchObject({
      mask_personal_data_properties: true,
      custom_personal_data_properties: expect.arrayContaining(['token']),
    })
  })

  it('masks only form inputs in session replay', () => {
    expect(POSTHOG_BROWSER_OPTIONS.session_recording).toEqual({ maskAllInputs: true })
  })
})
