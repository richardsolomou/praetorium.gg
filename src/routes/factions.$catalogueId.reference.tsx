import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/factions/$catalogueId/reference')({
  beforeLoad: ({ location, params, search }) => {
    const detachment = location.pathname.match(/\/reference\/detachments\/([^/]+)$/)?.[1]
    if (detachment) {
      throw redirect({
        to: '/factions/$catalogueId/detachments/$detachmentId',
        params: { catalogueId: params.catalogueId, detachmentId: detachment },
        search,
        replace: true,
      })
    }
    if (location.pathname.endsWith('/reference/datasheets')) {
      throw redirect({ to: '/factions/$catalogueId/datasheets', params, search, replace: true })
    }
    throw redirect({ to: '/factions/$catalogueId', params, search, replace: true })
  },
})
