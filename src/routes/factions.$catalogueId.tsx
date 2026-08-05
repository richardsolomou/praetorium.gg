import { createFileRoute, notFound, Outlet, redirect } from '@tanstack/react-router'
import { factionFor } from '../client/factions'
import { factionsQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId')({
  loader: async ({ context, location, params }) => {
    const data = await context.queryClient.ensureQueryData(factionsQuery())
    const faction = factionFor(data, params.catalogueId)
    if (!faction) throw notFound()
    if (location.pathname === `/factions/${params.catalogueId}`) {
      throw redirect({ to: '/factions/$catalogueId/reference', params: { catalogueId: faction.slug }, replace: true })
    }
  },
  component: Outlet,
})
