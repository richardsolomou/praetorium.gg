import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { FactionDatasheet } from '../client/components/FactionDatasheet'
import { datasheetSlugQuery, factionQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/$entryId')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/factions/$catalogueId/datasheets/$entryId', params, replace: true })
  },
  loader: async ({ context, params }) => {
    const faction = await context.queryClient.query({ ...factionQuery(params.catalogueId), staleTime: 'static' })
    if (!faction || !(await context.queryClient.query({ ...datasheetSlugQuery(faction.id, params.entryId), staleTime: 'static' })))
      throw notFound()
  },
  component: FactionDatasheet,
})
