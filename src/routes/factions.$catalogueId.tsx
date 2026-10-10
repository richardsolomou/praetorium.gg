import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { pageHead } from '../client/linkPreview'
import { loadReferenceFaction, favouriteDetachmentsQuery, favouriteFactionsQuery } from '../client/queries'
import { factionReferenceHref, factionReferenceRoute } from '../core/factionReferenceRoute'
import { FactionPage } from '../client/features/reference/factions/FactionPage'

export const Route = createFileRoute('/factions/$catalogueId')({
  validateSearch: z.object({
    rules: z
      .string()
      .min(1)
      .max(40)
      .regex(/^[a-z0-9-]+$/)
      .optional(),
  }),
  loaderDeps: ({ search }) => ({ rules: search.rules }),
  loader: async ({ context, location, params, deps }) => {
    const direct = location.pathname === `/factions/${params.catalogueId}`
    const versioned = location.pathname.startsWith(`/factions/${params.catalogueId}/rules/`)
    const [faction] = await Promise.all([
      loadReferenceFaction(context.queryClient, params.catalogueId, versioned ? undefined : deps.rules),
      ...(direct
        ? [
            context.queryClient.query({ ...favouriteFactionsQuery(), staleTime: 'static' }),
            context.queryClient.query({ ...favouriteDetachmentsQuery(), staleTime: 'static' }),
          ]
        : []),
    ])
    if (!faction) throw notFound()
    const route = factionReferenceRoute(faction)
    if (!versioned && (params.catalogueId !== route.catalogueId || deps.rules || route.rulesVersion))
      throw redirect({
        href: factionReferenceHref(faction, location.pathname.slice(`/factions/${params.catalogueId}`.length)),
        replace: true,
      })
    return { name: faction.displayName, slug: route.catalogueId, faction }
  },
  head: ({ loaderData, match, matches }) =>
    loaderData && matches.at(-1)?.routeId === match.routeId
      ? pageHead(match.context.origin, {
          title: loaderData.name,
          description: `${loaderData.name} army rules, detachments, datasheets, loadouts and points.`,
          path: factionReferenceHref(loaderData.faction),
        })
      : {},
  component: () => <FactionPage catalogueId={Route.useLoaderData().faction.id} routeCatalogueId={Route.useParams().catalogueId} />,
})
