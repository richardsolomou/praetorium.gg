import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/factions/$catalogueId/reference')({
  beforeLoad: ({ location, params }) => {
    const detachment = location.pathname.match(/\/reference\/detachments\/([^/]+)$/)?.[1]
    if (detachment) {
      throw redirect({
        to: '/factions/$catalogueId/detachments/$detachmentId',
        params: { catalogueId: params.catalogueId, detachmentId: detachment },
        replace: true,
      })
    }
    if (location.pathname.endsWith('/reference/datasheets')) {
      throw redirect({ to: '/factions/$catalogueId/datasheets', params, replace: true })
    }
    throw redirect({ to: '/factions/$catalogueId', params, replace: true })
  },
})
