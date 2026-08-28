const IOS_BUNDLE_ID = 'gg.praetorium'
const ANDROID_PACKAGE = 'gg.praetorium'

export function appleAppSiteAssociation(teamId: string | undefined) {
  if (!teamId?.trim()) return null
  const normalized = teamId.trim().toUpperCase()
  if (!/^[A-Z0-9]{10}$/.test(normalized)) throw new Error('APPLE_TEAM_ID must be a 10-character Apple team identifier')
  return { applinks: { apps: [], details: [{ appID: `${normalized}.${IOS_BUNDLE_ID}`, paths: ['*'] }] } }
}

export function androidAssetLinks(fingerprints: string | undefined) {
  if (!fingerprints?.trim()) return null
  const normalized = fingerprints
    .split(',')
    .map((fingerprint) => fingerprint.trim().toUpperCase())
    .filter(Boolean)
  if (!normalized.length || normalized.some((fingerprint) => !/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(fingerprint))) {
    throw new Error('ANDROID_APP_CERTIFICATE_SHA256_FINGERPRINTS must contain comma-separated SHA-256 certificate fingerprints')
  }
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: normalized },
    },
  ]
}

export function mobileAssociationResponse(value: unknown) {
  if (!value) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  return Response.json(value, { headers: { 'Cache-Control': 'public, max-age=3600' } })
}
