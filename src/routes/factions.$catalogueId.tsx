import { createFileRoute, notFound } from '@tanstack/react-router'
import { pageMeta } from '../client/linkPreview'
import { factionQuery, favouriteDetachmentsQuery, favouriteFactionsQuery } from '../client/queries'
import { FactionPage } from '../client/features/reference/factions/FactionPage'

export const Route = createFileRoute('/factions/$catalogueId')({
  loader: async ({ context, location, params }) => {
    const direct = location.pathname === `/factions/${params.catalogueId}`
    const [faction] = await Promise.all([
      context.queryClient.query({ ...factionQuery(params.catalogueId), staleTime: 'static' }),
      ...(direct
        ? [
            context.queryClient.query({ ...favouriteFactionsQuery(), staleTime: 'static' }),
            context.queryClient.query({ ...favouriteDetachmentsQuery(), staleTime: 'static' }),
          ]
        : []),
    ])
    if (!faction) throw notFound()
    return { name: faction.displayName, slug: faction.slug }
  },
  head: ({ loaderData, match, matches }) => ({
    meta:
      loaderData && matches.at(-1)?.routeId === match.routeId
        ? pageMeta(match.context.origin, {
            title: loaderData.name,
            description: `${loaderData.name} army rules, detachments, datasheets, loadouts and points.`,
            path: `/factions/${loaderData.slug}`,
          })
        : [],
  }),
  component: () => <FactionPage catalogueId={Route.useParams().catalogueId} />,
})
