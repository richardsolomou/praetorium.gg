import { createFileRoute } from '@tanstack/react-router'
import { appleAppSiteAssociation, mobileAssociationResponse } from '../server/mobileAssociations'

export const Route = createFileRoute('/.well-known/apple-app-site-association')({
  server: { handlers: { GET: () => mobileAssociationResponse(appleAppSiteAssociation(process.env.APPLE_TEAM_ID)) } },
})
