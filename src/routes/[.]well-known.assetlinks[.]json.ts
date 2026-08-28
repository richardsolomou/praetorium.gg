import { createFileRoute } from '@tanstack/react-router'
import { androidAssetLinks, mobileAssociationResponse } from '../server/mobileAssociations'

export const Route = createFileRoute('/.well-known/assetlinks.json')({
  server: {
    handlers: { GET: () => mobileAssociationResponse(androidAssetLinks(process.env.ANDROID_APP_CERTIFICATE_SHA256_FINGERPRINTS)) },
  },
})
