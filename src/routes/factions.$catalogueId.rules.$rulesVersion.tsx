import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionPage } from '../client/features/reference/factions/FactionPage'
import { loadReferenceFaction, favouriteDetachmentsQuery, favouriteFactionsQuery } from '../client/queries'
import { factionReferenceHref } from '../core/factionReferenceRoute'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/factions/$catalogueId/rules/$rulesVersion')({
  loader: async ({ context, location, params }) => {
    const direct = location.pathname === `/factions/${params.catalogueId}/rules/${params.rulesVersion}`
    const [faction] = await Promise.all([
      loadReferenceFaction(context.queryClient, params.catalogueId, params.rulesVersion),
      ...(direct
        ? [
            context.queryClient.query({ ...favouriteFactionsQuery(), staleTime: 'static' }),
            context.queryClient.query({ ...favouriteDetachmentsQuery(), staleTime: 'static' }),
          ]
        : []),
    ])
    if (!faction) throw notFound()
    return { faction }
  },
  head: ({ loaderData, match, matches }) =>
    loaderData && matches.at(-1)?.routeId === match.routeId
      ? pageHead(match.context.origin, {
          title: loaderData.faction.displayName,
          description: `${loaderData.faction.displayName} army rules, detachments, datasheets, loadouts and points.`,
          path: factionReferenceHref(loaderData.faction),
        })
      : {},
  component: () => (
    <FactionPage
      catalogueId={Route.useLoaderData().faction.id}
      routeCatalogueId={`${Route.useParams().catalogueId}/rules/${Route.useParams().rulesVersion}`}
    />
  ),
})
