import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { loadReferenceFaction } from '../client/queries'
import { factionReferenceHref } from '../core/factionReferenceRoute'

export const Route = createFileRoute('/factions/$catalogueId/rules/$rulesVersion')({
  loader: async ({ context, location, params }) => {
    const faction = await loadReferenceFaction(context.queryClient, params.catalogueId, params.rulesVersion)
    if (!faction) throw notFound()
    const suffix = location.pathname.slice(`/factions/${params.catalogueId}/rules/${params.rulesVersion}`.length)
    const href = factionReferenceHref(faction, suffix)
    if (href !== location.pathname) throw redirect({ href, replace: true })
    return { faction }
  },
})
