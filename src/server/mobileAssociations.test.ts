import { describe, expect, it } from 'vitest'
import { androidAssetLinks, appleAppSiteAssociation, mobileAssociationResponse } from './mobileAssociations'

const fingerprint = Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, '0')).join(':')

describe('mobile application associations', () => {
  it('builds the Apple association from a real release identifier', () => {
    expect(appleAppSiteAssociation('abcde12345')).toEqual({
      applinks: { apps: [], details: [{ appID: 'ABCDE12345.gg.praetorium', paths: ['*'] }] },
    })
  })

  it('builds Android links from one or more release fingerprints', () => {
    expect(androidAssetLinks(`${fingerprint},${fingerprint}`)?.[0]?.target).toEqual({
      namespace: 'android_app',
      package_name: 'gg.praetorium',
      sha256_cert_fingerprints: [fingerprint.toUpperCase(), fingerprint.toUpperCase()],
    })
  })

  it('fails closed when release identity is absent or malformed', () => {
    expect(appleAppSiteAssociation(undefined)).toBeNull()
    expect(androidAssetLinks('')).toBeNull()
    expect(() => appleAppSiteAssociation('team')).toThrow('APPLE_TEAM_ID')
    expect(() => androidAssetLinks('not-a-fingerprint')).toThrow('ANDROID_APP_CERTIFICATE_SHA256_FINGERPRINTS')
    expect(mobileAssociationResponse(null).status).toBe(404)
  })
})
