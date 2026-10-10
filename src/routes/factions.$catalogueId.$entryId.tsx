import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { FactionDatasheet } from '../client/features/reference/factions/FactionDatasheet'
import { datasheetSlugQuery, loadReferenceFaction } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/$entryId')({
  beforeLoad: ({ params, search }) => {
    throw redirect({ to: '/factions/$catalogueId/datasheets/$entryId', params, search, replace: true })
  },
  loaderDeps: ({ search }) => ({ rules: search.rules }),
  loader: async ({ context, params, deps }) => {
    const faction = await loadReferenceFaction(context.queryClient, params.catalogueId, deps.rules)
    if (!faction || !(await context.queryClient.query({ ...datasheetSlugQuery(faction.id, params.entryId), staleTime: 'static' })))
      throw notFound()
  },
  component: FactionDatasheet,
})
